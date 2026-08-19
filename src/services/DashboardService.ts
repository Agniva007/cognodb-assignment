import type { AdvisoryRepository } from "@/repositories/AdvisoryRepository";
import type { GraphRepository } from "@/repositories/GraphRepository";
import type { PackageRepository } from "@/repositories/PackageRepository";
import type {
  ChokePoint,
  GraphStats,
  MaintainerCluster,
  PopularPackage,
  RankedAdvisory,
} from "@/models";

export interface DashboardData {
  stats: GraphStats;
  worstAdvisories: RankedAdvisory[];
  mostDependedOn: PopularPackage[];
}

/** Dashboard use-cases: the landing-page aggregate and ecosystem analysis. */
export class DashboardService {
  constructor(
    private readonly graph: GraphRepository,
    private readonly advisories: AdvisoryRepository,
    private readonly packages: PackageRepository
  ) {}

  async getOverview(): Promise<DashboardData> {
    const [stats, worstAdvisories, mostDependedOn] = await Promise.all([
      this.graph.getStats(),
      this.advisories.findWidestBlastRadius(),
      this.packages.findMostDependedOn(),
    ]);
    return { stats, worstAdvisories, mostDependedOn };
  }

  async getChokePoints(minDownloads: number, k: number): Promise<ChokePoint[]> {
    return this.graph.findChokePoints(minDownloads, k);
  }

  async getMaintainerClusters(minDownloads: number, minShared: number): Promise<MaintainerCluster[]> {
    return this.graph.findMaintainerClusters(minDownloads, minShared);
  }

  async isHealthy(): Promise<boolean> {
    return this.graph.ping();
  }
}
