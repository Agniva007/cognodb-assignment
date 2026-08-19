/**
 * seed.ts — loads data/dataset.json into CognoDB.
 *
 * Reads NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD from .env (or the environment).
 * Idempotent: constraints + MERGE everywhere, safe to re-run.
 *
 * Usage: npm run seed  (optionally: npx tsx scripts/seed.ts --wipe)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import neo4j, { Driver } from "neo4j-driver";
import semver from "semver";

interface DatasetPackage {
  name: string;
  description: string;
  license: string;
  weeklyDownloads: number;
  latestVersion: string;
  publishedAt: string;
  dependencies: Record<string, string>;
  maintainers: string[];
}
interface DatasetAdvisory {
  id: string;
  aliases: string[];
  summary: string;
  severity: string;
  cvss: number | null;
  url: string;
  packageName: string;
  vulnerableRange: string;
  events: Array<{ introduced?: string; fixed?: string; lastAffected?: string }>;
  publishedAt: string;
}

const BATCH = 500;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill in your CognoDB credentials.`);
    process.exit(1);
  }
  return v;
}

/** Is `version` inside the advisory's affected events (introduced/fixed pairs)? */
function versionAffected(version: string, events: DatasetAdvisory["events"]): boolean {
  const v = semver.coerce(version)?.version;
  if (!v) return false;
  let affected = false;
  for (const e of events) {
    if (e.introduced !== undefined) {
      const intro = e.introduced === "0" ? "0.0.0" : semver.coerce(e.introduced)?.version;
      if (intro && semver.gte(v, intro)) affected = true;
    }
    if (e.fixed !== undefined) {
      const fixed = semver.coerce(e.fixed)?.version;
      if (fixed && semver.gte(v, fixed)) affected = false;
    }
    if (e.lastAffected !== undefined) {
      const last = semver.coerce(e.lastAffected)?.version;
      if (last && semver.gt(v, last)) affected = false;
    }
  }
  return affected;
}

async function runBatched(driver: Driver, cypher: string, rows: unknown[]) {
  const session = driver.session();
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      await session.executeWrite((tx) => tx.run(cypher, { rows: slice }));
      process.stdout.write(`\r  ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
    }
    if (rows.length) process.stdout.write("\n");
  } finally {
    await session.close();
  }
}

async function main() {
  const uri = requireEnv("NEO4J_URI");
  const user = requireEnv("NEO4J_USER");
  const password = requireEnv("NEO4J_PASSWORD");

  const raw = JSON.parse(readFileSync(join(process.cwd(), "data", "dataset.json"), "utf8")) as {
    packages: DatasetPackage[];
    advisories: DatasetAdvisory[];
  };
  console.log(`dataset: ${raw.packages.length} packages, ${raw.advisories.length} advisories`);

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  await driver.verifyConnectivity();
  console.log("connected to", uri.replace(/\/\/.*@/, "//"));

  const session = driver.session();
  try {
    if (process.argv.includes("--wipe")) {
      console.log("wiping existing data…");
      // batched delete keeps memory bounded on the free tier
      let deleted = 1;
      while (deleted > 0) {
        const res = await session.run(
          "MATCH (n) WITH n LIMIT 5000 DETACH DELETE n RETURN count(n) AS c"
        );
        deleted = res.records[0].get("c").toNumber();
      }
    }

    console.log("creating constraints & indexes…");
    const ddl = [
      "CREATE CONSTRAINT pkg_name IF NOT EXISTS FOR (p:Package) REQUIRE p.name IS UNIQUE",
      "CREATE CONSTRAINT advisory_id IF NOT EXISTS FOR (a:Advisory) REQUIRE a.id IS UNIQUE",
      "CREATE CONSTRAINT maintainer_name IF NOT EXISTS FOR (m:Maintainer) REQUIRE m.name IS UNIQUE",
      "CREATE CONSTRAINT version_key IF NOT EXISTS FOR (v:Version) REQUIRE v.key IS UNIQUE",
      "CREATE INDEX pkg_downloads IF NOT EXISTS FOR (p:Package) ON (p.weeklyDownloads)",
      "CREATE INDEX advisory_severity IF NOT EXISTS FOR (a:Advisory) ON (a.severity)",
    ];
    for (const stmt of ddl) await session.run(stmt);
  } finally {
    await session.close();
  }

  // -- nodes ---------------------------------------------------------------
  console.log("loading Package nodes…");
  await runBatched(
    driver,
    `UNWIND $rows AS row
     MERGE (p:Package {name: row.name})
     SET p.description = row.description,
         p.license = row.license,
         p.weeklyDownloads = row.weeklyDownloads,
         p.latestVersion = row.latestVersion`,
    raw.packages.map((p) => ({
      name: p.name,
      description: p.description,
      license: p.license,
      weeklyDownloads: p.weeklyDownloads,
      latestVersion: p.latestVersion,
    }))
  );

  console.log("loading Version nodes (latest per package)…");
  await runBatched(
    driver,
    `UNWIND $rows AS row
     MATCH (p:Package {name: row.name})
     MERGE (v:Version {key: row.key})
     SET v.semver = row.semver, v.publishedAt = row.publishedAt, v.isLatest = true
     MERGE (p)-[:HAS_VERSION]->(v)`,
    raw.packages.map((p) => ({
      name: p.name,
      key: `${p.name}@${p.latestVersion}`,
      semver: p.latestVersion,
      publishedAt: p.publishedAt,
    }))
  );

  console.log("loading Maintainer nodes + MAINTAINS…");
  const maintainerRows = raw.packages.flatMap((p) =>
    p.maintainers.map((m) => ({ maintainer: m, pkg: p.name }))
  );
  await runBatched(
    driver,
    `UNWIND $rows AS row
     MATCH (p:Package {name: row.pkg})
     MERGE (m:Maintainer {name: row.maintainer})
     MERGE (m)-[:MAINTAINS]->(p)`,
    maintainerRows
  );

  // -- dependency edges ----------------------------------------------------
  // Version -[:DEPENDS_ON]-> Package (only for packages present in the graph),
  // plus materialized Package -[:DEPENDS_ON_PKG]-> Package for fast traversal.
  const inGraph = new Set(raw.packages.map((p) => p.name));
  const depRows = raw.packages.flatMap((p) =>
    Object.entries(p.dependencies)
      .filter(([dep]) => inGraph.has(dep))
      .map(([dep, range]) => ({
        versionKey: `${p.name}@${p.latestVersion}`,
        from: p.name,
        to: dep,
        range,
      }))
  );
  console.log(`loading ${depRows.length} DEPENDS_ON edges…`);
  await runBatched(
    driver,
    `UNWIND $rows AS row
     MATCH (v:Version {key: row.versionKey})
     MATCH (target:Package {name: row.to})
     MERGE (v)-[d:DEPENDS_ON]->(target)
     SET d.range = row.range`,
    depRows
  );
  console.log("materializing DEPENDS_ON_PKG shortcut edges…");
  await runBatched(
    driver,
    `UNWIND $rows AS row
     MATCH (a:Package {name: row.from})
     MATCH (b:Package {name: row.to})
     MERGE (a)-[d:DEPENDS_ON_PKG]->(b)
     SET d.range = row.range`,
    depRows
  );

  // -- advisories ----------------------------------------------------------
  const advisoriesInGraph = raw.advisories.filter((a) => inGraph.has(a.packageName));
  console.log(`loading ${advisoriesInGraph.length} Advisory nodes + AFFECTS…`);
  await runBatched(
    driver,
    `UNWIND $rows AS row
     MERGE (a:Advisory {id: row.id})
     SET a.summary = row.summary, a.severity = row.severity, a.cvss = row.cvss,
         a.url = row.url, a.publishedAt = row.publishedAt, a.aliases = row.aliases
     WITH a, row
     MATCH (p:Package {name: row.packageName})
     MERGE (a)-[r:AFFECTS]->(p)
     SET r.vulnerableRange = row.vulnerableRange`,
    advisoriesInGraph.map((a) => ({
      id: a.id,
      summary: a.summary,
      severity: a.severity,
      cvss: a.cvss,
      url: a.url,
      publishedAt: a.publishedAt,
      aliases: a.aliases,
      packageName: a.packageName,
      vulnerableRange: a.vulnerableRange,
    }))
  );

  // AFFECTS_VERSION: semver matching done here in JS, not in Cypher.
  const pkgByName = new Map(raw.packages.map((p) => [p.name, p]));
  const affectsVersionRows = advisoriesInGraph
    .filter((a) => {
      const pkg = pkgByName.get(a.packageName);
      return pkg && versionAffected(pkg.latestVersion, a.events);
    })
    .map((a) => ({
      advisoryId: a.id,
      versionKey: `${a.packageName}@${pkgByName.get(a.packageName)!.latestVersion}`,
    }));
  console.log(`loading ${affectsVersionRows.length} AFFECTS_VERSION edges (latest version still vulnerable)…`);
  await runBatched(
    driver,
    `UNWIND $rows AS row
     MATCH (a:Advisory {id: row.advisoryId})
     MATCH (v:Version {key: row.versionKey})
     MERGE (a)-[:AFFECTS_VERSION]->(v)`,
    affectsVersionRows
  );

  // -- summary -------------------------------------------------------------
  const summarySession = driver.session();
  try {
    const nodesRes = await summarySession.run("MATCH (n) RETURN count(n) AS c");
    const relsRes = await summarySession.run("MATCH ()-[r]->() RETURN count(r) AS c");
    console.log(
      `done: ${nodesRes.records[0].get("c")} nodes, ${relsRes.records[0].get("c")} relationships`
    );
  } finally {
    await summarySession.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error("seed failed:", err.message ?? err);
  process.exit(1);
});
