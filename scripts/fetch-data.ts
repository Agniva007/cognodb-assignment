/**
 * fetch-data.ts — builds data/dataset.json from live sources:
 *   - npm registry (package metadata + dependencies), BFS from SEED_PACKAGES
 *   - npm downloads API (weekly download counts)
 *   - OSV.dev (real security advisories for the npm ecosystem)
 *
 * The output is committed to the repo so `npm run seed` never needs network
 * access or API keys. Re-run this script only to refresh the snapshot.
 *
 * Usage: npx tsx scripts/fetch-data.ts [--cap 1200] [--depth 3]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const REGISTRY = "https://registry.npmjs.org";
const DOWNLOADS = "https://api.npmjs.org/downloads/point/last-week";
const OSV = "https://api.osv.dev/v1/query";

const argv = process.argv.slice(2);
function flag(name: string, fallback: number): number {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
}
const PACKAGE_CAP = flag("cap", 1200);
const MAX_DEPTH = flag("depth", 3);
const CONCURRENCY = 12;

/** Well-known, heavily-depended-upon packages to root the BFS. */
const SEED_PACKAGES = [
  "express", "react", "react-dom", "next", "vue", "lodash", "axios",
  "webpack", "vite", "typescript", "jest", "mocha", "eslint", "prettier",
  "chalk", "commander", "yargs", "inquirer", "dotenv", "uuid", "moment",
  "dayjs", "date-fns", "rxjs", "zod", "yup", "joi", "mongoose", "sequelize",
  "prisma", "pg", "mysql2", "redis", "ioredis", "socket.io", "ws",
  "node-fetch", "got", "superagent", "request", "body-parser", "cors",
  "helmet", "morgan", "winston", "pino", "debug", "nodemon", "concurrently",
  "cross-env", "rimraf", "glob", "minimatch", "semver", "fs-extra",
  "js-yaml", "xml2js", "cheerio", "puppeteer", "playwright", "sharp",
  "multer", "passport", "jsonwebtoken", "bcrypt", "nodemailer", "stripe",
];

// ---------------------------------------------------------------- types

interface PackageRecord {
  name: string;
  description: string;
  license: string;
  weeklyDownloads: number;
  latestVersion: string;
  publishedAt: string;
  /** dependency name -> semver range, for the latest version */
  dependencies: Record<string, string>;
  maintainers: string[];
}

interface AdvisoryRecord {
  id: string; // e.g. GHSA-xxxx or CVE-xxxx
  aliases: string[];
  summary: string;
  severity: string; // CRITICAL | HIGH | MODERATE | LOW | UNKNOWN
  cvss: number | null;
  url: string;
  packageName: string;
  vulnerableRange: string; // human-readable range description
  /** concrete events for semver matching in seed.ts */
  events: Array<{ introduced?: string; fixed?: string; lastAffected?: string }>;
  publishedAt: string;
}

// ---------------------------------------------------------------- helpers

async function fetchJson<T>(url: string, init?: RequestInit, retries = 5): Promise<T | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 404) return null;
      if (res.status === 429) {
        // rate limited — back off hard before the next attempt
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt === retries - 1) {
        console.warn(`  ! giving up on ${url}: ${err}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  console.warn(`  ! rate-limited out of retries: ${url}`);
  return null;
}

/** Simple promise pool. */
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------- npm

interface NpmLatestDoc {
  name: string;
  version: string;
  description?: string;
  license?: string | { type?: string };
  dependencies?: Record<string, string>;
  maintainers?: Array<{ name: string }>;
}

async function fetchPackage(name: string): Promise<PackageRecord | null> {
  const doc = await fetchJson<NpmLatestDoc>(`${REGISTRY}/${encodeURIComponent(name).replace("%40", "@")}/latest`);
  if (!doc) return null;
  const timeDoc = await fetchJson<{ time?: Record<string, string> }>(
    `${REGISTRY}/${encodeURIComponent(name).replace("%40", "@")}`,
    { headers: { Accept: "application/vnd.npm.install-v1+json" } }
  );
  const license = typeof doc.license === "string" ? doc.license : doc.license?.type ?? "";
  return {
    name: doc.name,
    description: doc.description ?? "",
    license,
    weeklyDownloads: 0, // filled later
    latestVersion: doc.version,
    publishedAt: timeDoc?.time?.[doc.version] ?? "",
    dependencies: doc.dependencies ?? {},
    maintainers: (doc.maintainers ?? []).map((m) => m.name),
  };
}

async function fetchDownloads(names: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  // Bulk endpoint takes up to 128 comma-separated non-scoped names; scoped go one-by-one.
  const scoped = names.filter((n) => n.startsWith("@"));
  const plain = names.filter((n) => !n.startsWith("@"));
  for (let i = 0; i < plain.length; i += 128) {
    const batch = plain.slice(i, i + 128);
    const res = await fetchJson<Record<string, { downloads: number } | null>>(
      `${DOWNLOADS}/${batch.join(",")}`
    );
    if (res) {
      if (batch.length === 1) {
        const single = res as unknown as { downloads?: number };
        out.set(batch[0], single.downloads ?? 0);
      } else {
        for (const [k, v] of Object.entries(res)) out.set(k, v?.downloads ?? 0);
      }
    }
  }
  // scoped names go one-by-one; low concurrency to stay under the rate limit
  await pool(scoped, 3, async (name) => {
    // the inner slash is encoded: @scope%2Fname
    const res = await fetchJson<{ downloads?: number }>(
      `${DOWNLOADS}/${name.replace("/", "%2F")}`
    );
    out.set(name, res?.downloads ?? 0);
  });
  return out;
}

// ---------------------------------------------------------------- OSV

interface OsvVuln {
  id: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  published?: string;
  severity?: Array<{ type: string; score: string }>;
  database_specific?: { severity?: string };
  affected?: Array<{
    package?: { name?: string; ecosystem?: string };
    ranges?: Array<{ type: string; events: Array<Record<string, string>> }>;
    database_specific?: { last_known_affected_version_range?: string };
  }>;
  references?: Array<{ type: string; url: string }>;
}

function cvssScore(v: OsvVuln): number | null {
  // OSV encodes CVSS as a vector string; extract nothing fancy — GHSA usually
  // also provides database_specific.severity which we use as the label.
  const s = v.severity?.find((x) => x.type.startsWith("CVSS"));
  if (!s) return null;
  // Vector strings don't carry the numeric score; leave null unless numeric.
  const asNum = Number(s.score);
  return Number.isFinite(asNum) ? asNum : null;
}

async function fetchAdvisories(name: string): Promise<AdvisoryRecord[]> {
  const res = await fetchJson<{ vulns?: OsvVuln[] }>(OSV, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ package: { name, ecosystem: "npm" } }),
  });
  if (!res?.vulns) return [];
  return res.vulns.map((v) => {
    const affected = (v.affected ?? []).find(
      (a) => a.package?.ecosystem === "npm" && a.package?.name === name
    );
    const events =
      affected?.ranges?.find((r) => r.type === "SEMVER" || r.type === "ECOSYSTEM")?.events ?? [];
    const rangeText = events
      .map((e) =>
        e.introduced !== undefined
          ? `>=${e.introduced === "0" ? "0.0.0" : e.introduced}`
          : e.fixed !== undefined
            ? `<${e.fixed}`
            : e.last_affected !== undefined
              ? `<=${e.last_affected}`
              : ""
      )
      .filter(Boolean)
      .join(" ");
    const advisoryUrl =
      v.references?.find((r) => r.type === "ADVISORY")?.url ??
      `https://osv.dev/vulnerability/${v.id}`;
    return {
      id: v.id,
      aliases: v.aliases ?? [],
      summary: v.summary ?? v.details?.slice(0, 200) ?? "",
      severity: (v.database_specific?.severity ?? "UNKNOWN").toUpperCase(),
      cvss: cvssScore(v),
      url: advisoryUrl,
      packageName: name,
      vulnerableRange: rangeText || "unknown",
      events: events.map((e) => ({
        introduced: e.introduced,
        fixed: e.fixed,
        lastAffected: e.last_affected,
      })),
      publishedAt: v.published ?? "",
    };
  });
}

// ---------------------------------------------------------------- main

async function main() {
  console.log(`BFS from ${SEED_PACKAGES.length} seeds, depth<=${MAX_DEPTH}, cap=${PACKAGE_CAP}`);

  const packages = new Map<string, PackageRecord>();
  let frontier = [...SEED_PACKAGES];

  for (let depth = 0; depth <= MAX_DEPTH && packages.size < PACKAGE_CAP; depth++) {
    const toFetch = [...new Set(frontier)].filter((n) => !packages.has(n));
    const budget = PACKAGE_CAP - packages.size;
    const batch = toFetch.slice(0, budget);
    if (batch.length === 0) break;
    console.log(`depth ${depth}: fetching ${batch.length} packages (have ${packages.size})`);
    const fetched = await pool(batch, CONCURRENCY, fetchPackage);
    const nextFrontier: string[] = [];
    fetched.forEach((rec) => {
      if (!rec) return;
      packages.set(rec.name, rec);
      nextFrontier.push(...Object.keys(rec.dependencies));
    });
    frontier = nextFrontier;
  }
  console.log(`fetched ${packages.size} packages`);

  console.log("fetching weekly downloads…");
  const downloads = await fetchDownloads([...packages.keys()]);
  for (const [name, rec] of packages) rec.weeklyDownloads = downloads.get(name) ?? 0;

  console.log("querying OSV.dev for advisories…");
  const advisoryLists = await pool([...packages.keys()], CONCURRENCY, fetchAdvisories);
  const advisories = new Map<string, AdvisoryRecord>();
  for (const list of advisoryLists) {
    for (const a of list) {
      // one OSV id can affect several packages; key by id+package
      advisories.set(`${a.id}::${a.packageName}`, a);
    }
  }
  console.log(`found ${advisories.size} advisory-package records`);

  const outDir = join(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  const dataset = {
    generatedAt: new Date().toISOString(),
    parameters: { seeds: SEED_PACKAGES.length, cap: PACKAGE_CAP, depth: MAX_DEPTH },
    packages: [...packages.values()],
    advisories: [...advisories.values()],
  };
  writeFileSync(join(outDir, "dataset.json"), JSON.stringify(dataset, null, 1));
  console.log(
    `wrote data/dataset.json — ${dataset.packages.length} packages, ${dataset.advisories.length} advisories`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
