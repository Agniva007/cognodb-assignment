import { Database, int, toNum } from "@/lib/db";
import type {
  ChokePoint,
  DependencyPath,
  GraphStats,
  MaintainerCluster,
} from "@/models";

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

  /**
   * Shared-maintainer clusters: pairs of maintainers whose packages keep
   * co-occurring inside the same dependency trees.
   *
   * Where the choke-point query finds a single point of failure, this one
   * finds *correlated* ones — if either maintainer's account is compromised,
   * the same set of popular packages is in range. The pairing is the graph
   * doing the work: collect the maintainers reachable through each popular
   * package's tree, self-join that collection to form pairs, then count the
   * trees each pair co-occurs in. Roots are capped and ordered by downloads so
   * the self-join stays bounded on the free tier.
   */
  async findMaintainerClusters(
    minDownloads = 1_000_000,
    minShared = 3,
    roots = 150,
    limit = 20
  ): Promise<MaintainerCluster[]> {
    return this.db.read(
      `MATCH (root:Package)
       WHERE root.weeklyDownloads > $minDownloads
       WITH root ORDER BY root.weeklyDownloads DESC LIMIT $roots
       MATCH (root)-[:DEPENDS_ON_PKG*0..3]->(p:Package)<-[:MAINTAINS]-(m:Maintainer)
       WITH root, collect(DISTINCT m.name) AS maintainers
       UNWIND maintainers AS a
       UNWIND maintainers AS b
       WITH a, b, root
       WHERE a < b
       WITH a, b, count(DISTINCT root) AS sharedTrees,
            collect(DISTINCT root.name)[0..4] AS examples
       WHERE sharedTrees >= $minShared
       RETURN a AS maintainerA, b AS maintainerB, sharedTrees, examples
       ORDER BY sharedTrees DESC, maintainerA
       LIMIT $limit`,
      {
        minDownloads: int(minDownloads),
        minShared: int(minShared),
        roots: int(roots),
        limit: int(limit),
      },
      (r) => ({
        maintainerA: r.get("maintainerA"),
        maintainerB: r.get("maintainerB"),
        sharedTrees: toNum(r.get("sharedTrees")),
        examples: r.get("examples") as string[],
      })
    );
  }

  async ping(): Promise<boolean> {
    const rows = await this.db.read("RETURN 1 AS c", {}, (r) => toNum(r.get("c")));
    return rows[0] === 1;
  }
}
