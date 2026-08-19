import { Database, int, toNum } from "@/lib/db";
import type {
  Dependency,
  Dependent,
  PackageDetail,
  PackageSummary,
  PopularPackage,
  TreeAdvisory,
} from "@/models";

/** All Cypher touching Package nodes. Parameterized end-to-end — no string-built Cypher. */
export class PackageRepository {
  constructor(private readonly db: Database) {}

  async search(q: string, limit = 10): Promise<PackageSummary[]> {
    return this.db.read(
      `MATCH (p:Package)
       WHERE toLower(p.name) CONTAINS toLower($q)
       RETURN p.name AS name, p.description AS description,
              p.weeklyDownloads AS weeklyDownloads, p.latestVersion AS latestVersion
       ORDER BY p.weeklyDownloads DESC
       LIMIT $limit`,
      { q, limit: int(limit) },
      (r) => ({
        name: r.get("name"),
        description: r.get("description") ?? "",
        weeklyDownloads: toNum(r.get("weeklyDownloads")),
        latestVersion: r.get("latestVersion") ?? "",
      })
    );
  }

  async findByName(name: string): Promise<PackageDetail | null> {
    const rows = await this.db.read(
      `MATCH (p:Package {name: $name})
       OPTIONAL MATCH (m:Maintainer)-[:MAINTAINS]->(p)
       RETURN p.name AS name, p.description AS description, p.license AS license,
              p.weeklyDownloads AS weeklyDownloads, p.latestVersion AS latestVersion,
              collect(DISTINCT m.name) AS maintainers`,
      { name },
      (r) => ({
        name: r.get("name"),
        description: r.get("description") ?? "",
        license: r.get("license") ?? "",
        weeklyDownloads: toNum(r.get("weeklyDownloads")),
        latestVersion: r.get("latestVersion") ?? "",
        maintainers: (r.get("maintainers") as string[]).filter(Boolean),
      })
    );
    return rows[0] ?? null;
  }

  async findDependencies(name: string): Promise<Dependency[]> {
    return this.db.read(
      `MATCH (p:Package {name: $name})-[d:DEPENDS_ON_PKG]->(dep:Package)
       RETURN dep.name AS name, d.range AS range, dep.weeklyDownloads AS weeklyDownloads
       ORDER BY dep.weeklyDownloads DESC`,
      { name },
      (r) => ({
        name: r.get("name"),
        range: r.get("range") ?? "",
        weeklyDownloads: toNum(r.get("weeklyDownloads")),
      })
    );
  }

  async findDependents(name: string, limit = 25): Promise<Dependent[]> {
    return this.db.read(
      `MATCH (p:Package {name: $name})<-[:DEPENDS_ON_PKG]-(d:Package)
       RETURN d.name AS name, d.weeklyDownloads AS weeklyDownloads
       ORDER BY d.weeklyDownloads DESC
       LIMIT $limit`,
      { name, limit: int(limit) },
      (r) => ({ name: r.get("name"), weeklyDownloads: toNum(r.get("weeklyDownloads")) })
    );
  }

  /**
   * Multi-hop traversal: every advisory reachable through the package's
   * dependency tree within 4 hops, with the shortest exposure chain for each.
   */
  async findTreeAdvisories(name: string): Promise<TreeAdvisory[]> {
    return this.db.read(
      `MATCH (p:Package {name: $name})
       MATCH path = (p)-[:DEPENDS_ON_PKG*0..4]->(dep:Package)
       MATCH (dep)<-[:AFFECTS]-(a:Advisory)
       WITH a, dep, path ORDER BY length(path)
       WITH a, dep, head(collect(path)) AS shortest
       WITH a, dep, length(shortest) AS distance,
            [n IN nodes(shortest) | n.name] AS exampleChain
       RETURN a.id AS id, a.summary AS summary, a.severity AS severity, a.url AS url,
              dep.name AS packageName, distance, exampleChain
       ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1
                WHEN 'MODERATE' THEN 2 ELSE 3 END, distance`,
      { name },
      (r) => ({
        id: r.get("id"),
        summary: r.get("summary") ?? "",
        severity: r.get("severity"),
        url: r.get("url") ?? "",
        packageName: r.get("packageName"),
        distance: toNum(r.get("distance")),
        exampleChain: r.get("exampleChain") as string[],
      })
    );
  }

  async findMostDependedOn(limit = 8): Promise<PopularPackage[]> {
    return this.db.read(
      `MATCH (p:Package)<-[:DEPENDS_ON_PKG]-(d:Package)
       WITH p, count(d) AS directDependents
       RETURN p.name AS name, p.description AS description,
              p.weeklyDownloads AS weeklyDownloads, p.latestVersion AS latestVersion,
              directDependents
       ORDER BY directDependents DESC
       LIMIT $limit`,
      { limit: int(limit) },
      (r) => ({
        name: r.get("name"),
        description: r.get("description") ?? "",
        weeklyDownloads: toNum(r.get("weeklyDownloads")),
        latestVersion: r.get("latestVersion") ?? "",
        directDependents: toNum(r.get("directDependents")),
      })
    );
  }
}
