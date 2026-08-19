import { Database, int, toNum } from "@/lib/db";
import type {
  AdvisoryDetail,
  AdvisorySummary,
  BlastEdge,
  BlastNode,
  RankedAdvisory,
} from "@/models";

/** All Cypher touching Advisory nodes, including the blast-radius traversal. */
export class AdvisoryRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<AdvisoryDetail | null> {
    const rows = await this.db.read(
      `MATCH (a:Advisory {id: $id})-[af:AFFECTS]->(p:Package)
       RETURN a.id AS id, a.summary AS summary, a.severity AS severity, a.cvss AS cvss,
              a.url AS url, a.publishedAt AS publishedAt,
              p.name AS packageName, af.vulnerableRange AS vulnerableRange`,
      { id },
      (r) => ({
        id: r.get("id"),
        summary: r.get("summary") ?? "",
        severity: r.get("severity"),
        cvss: r.get("cvss") == null ? null : toNum(r.get("cvss")),
        url: r.get("url") ?? "",
        publishedAt: r.get("publishedAt") ?? "",
        packageName: r.get("packageName"),
        vulnerableRange: r.get("vulnerableRange") ?? "",
      })
    );
    return rows[0] ?? null;
  }

  async findByPackage(name: string): Promise<AdvisorySummary[]> {
    return this.db.read(
      `MATCH (a:Advisory)-[af:AFFECTS]->(p:Package {name: $name})
       RETURN a.id AS id, a.summary AS summary, a.severity AS severity, a.url AS url,
              p.name AS packageName, af.vulnerableRange AS vulnerableRange
       ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1
                WHEN 'MODERATE' THEN 2 ELSE 3 END`,
      { name },
      (r) => ({
        id: r.get("id"),
        summary: r.get("summary") ?? "",
        severity: r.get("severity"),
        url: r.get("url") ?? "",
        packageName: r.get("packageName"),
        vulnerableRange: r.get("vulnerableRange") ?? "",
      })
    );
  }

  /** Advisories ranked by how much of the graph sits downstream of the affected package. */
  async findWidestBlastRadius(limit = 8): Promise<RankedAdvisory[]> {
    return this.db.read(
      `MATCH (a:Advisory)-[:AFFECTS]->(p:Package)
       WHERE a.severity IN ['CRITICAL', 'HIGH', 'MODERATE']
       OPTIONAL MATCH (p)<-[:DEPENDS_ON_PKG*1..3]-(d:Package)
       WITH a, p, count(DISTINCT d) AS downstream
       RETURN a.id AS id, a.summary AS summary, a.severity AS severity, a.url AS url,
              p.name AS packageName, downstream
       ORDER BY downstream DESC,
                CASE a.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END
       LIMIT $limit`,
      { limit: int(limit) },
      (r) => ({
        id: r.get("id"),
        summary: r.get("summary") ?? "",
        severity: r.get("severity"),
        url: r.get("url") ?? "",
        packageName: r.get("packageName"),
        downstream: toNum(r.get("downstream")),
      })
    );
  }

  /**
   * THE headline multi-hop query: every package within `hops` dependency hops
   * of the vulnerable package, with hop distance and distinct-chain counts.
   *
   * The variable-length upper bound cannot be a Cypher parameter; the caller
   * clamps it to the 1..5 whitelist before it is inlined.
   */
  async findBlastNodes(id: string, hops: number): Promise<BlastNode[]> {
    const clamped = Math.min(Math.max(Math.trunc(hops), 1), 5);
    return this.db.read(
      `MATCH (a:Advisory {id: $id})-[:AFFECTS]->(root:Package)
       MATCH path = (root)<-[:DEPENDS_ON_PKG*1..${clamped}]-(d:Package)
       WITH d, min(length(path)) AS distance, count(path) AS chains
       RETURN d.name AS name, d.weeklyDownloads AS weeklyDownloads, distance, chains
       ORDER BY distance, weeklyDownloads DESC
       LIMIT 400`,
      { id },
      (r) => ({
        name: r.get("name"),
        weeklyDownloads: toNum(r.get("weeklyDownloads")),
        distance: toNum(r.get("distance")),
        chains: toNum(r.get("chains")),
      })
    );
  }

  async findRootPackage(id: string): Promise<BlastNode[]> {
    return this.db.read(
      `MATCH (a:Advisory {id: $id})-[:AFFECTS]->(root:Package)
       RETURN root.name AS name, root.weeklyDownloads AS weeklyDownloads`,
      { id },
      (r) => ({
        name: r.get("name"),
        weeklyDownloads: toNum(r.get("weeklyDownloads")),
        distance: 0,
        chains: 0,
      })
    );
  }

  /** Dependency edges among a set of packages (to draw the blast-radius graph). */
  async findEdgesAmong(names: string[]): Promise<BlastEdge[]> {
    return this.db.read(
      `MATCH (a:Package)-[:DEPENDS_ON_PKG]->(b:Package)
       WHERE a.name IN $names AND b.name IN $names
       RETURN a.name AS from, b.name AS to`,
      { names },
      (r) => ({ from: r.get("from"), to: r.get("to") })
    );
  }
}
