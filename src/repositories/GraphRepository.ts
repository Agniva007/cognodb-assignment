import { Database, int, toNum } from "@/lib/db";
import type { ChokePoint, DependencyPath, GraphStats } from "@/models";

/** Whole-graph Cypher: stats, shortest paths, and ecosystem-level analysis. */
export class GraphRepository {
  constructor(private readonly db: Database) {}

  async getStats(): Promise<GraphStats> {
    // four independent counts run in parallel — avoids CALL-subquery syntax
    // differences across server versions
    const count = async (cypher: string) => {
      const rows = await this.db.read(cypher, {}, (r) => toNum(r.get("c")));
      return rows[0] ?? 0;
    };
    const [packages, advisories, edges, maintainers] = await Promise.all([
      count("MATCH (p:Package) RETURN count(p) AS c"),
      count("MATCH (a:Advisory) RETURN count(a) AS c"),
      count("MATCH ()-[d:DEPENDS_ON_PKG]->() RETURN count(d) AS c"),
      count("MATCH (m:Maintainer) RETURN count(m) AS c"),
    ]);
    return { packages, advisories, edges, maintainers };
  }

  /** Concrete answer to "how am I exposed?" — the shortest dependency chain. */
  async findShortestPath(from: string, to: string): Promise<DependencyPath[]> {
    return this.db.read(
      `MATCH (a:Package {name: $from}), (b:Package {name: $to})
       MATCH path = shortestPath((a)-[:DEPENDS_ON_PKG*..6]->(b))
       RETURN [n IN nodes(path) | n.name] AS chain`,
      { from, to },
      (r) => ({ chain: r.get("chain") as string[] })
    );
  }

  /**
   * The query a relational database would find awkward: single-maintainer
   * packages sitting inside the dependency trees (within 3 hops) of at least
   * $k high-download packages — per-node aggregates + variable-length
   * reachability + path-aware group-by in one pattern.
   */
  async findChokePoints(minDownloads = 1_000_000, k = 5, limit = 20): Promise<ChokePoint[]> {
    return this.db.read(
      `MATCH (m:Maintainer)-[:MAINTAINS]->(p:Package)
       WITH p, count(m) AS maintainers
       WHERE maintainers = 1
       MATCH (p)<-[:DEPENDS_ON_PKG*1..3]-(top:Package)
       WHERE top.weeklyDownloads > $minDownloads
       WITH p, count(DISTINCT top) AS exposedTop
       WHERE exposedTop >= $k
       MATCH (only:Maintainer)-[:MAINTAINS]->(p)
       RETURN p.name AS name, p.weeklyDownloads AS weeklyDownloads,
              only.name AS maintainer, exposedTop
       ORDER BY exposedTop DESC
       LIMIT $limit`,
      { minDownloads: int(minDownloads), k: int(k), limit: int(limit) },
      (r) => ({
        name: r.get("name"),
        weeklyDownloads: toNum(r.get("weeklyDownloads")),
        maintainer: r.get("maintainer"),
        exposedTop: toNum(r.get("exposedTop")),
      })
    );
  }

  async ping(): Promise<boolean> {
    const rows = await this.db.read("RETURN 1 AS c", {}, (r) => toNum(r.get("c")));
    return rows[0] === 1;
  }
}
