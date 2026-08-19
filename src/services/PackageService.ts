import type { AdvisoryRepository } from "@/repositories/AdvisoryRepository";
import type { PackageRepository } from "@/repositories/PackageRepository";
import type {
  AdvisorySummary,
  Dependency,
  Dependent,
  PackageDetail,
  PackageSummary,
  TreeAdvisory,
} from "@/models";

export interface PackageProfile {
  pkg: PackageDetail;
  deps: Dependency[];
  dependents: Dependent[];
  advisories: AdvisorySummary[];
  treeAdvisories: TreeAdvisory[];
}

/** Package use-cases: search and the aggregated package profile. */
export class PackageService {
  constructor(
    private readonly packages: PackageRepository,
    private readonly advisories: AdvisoryRepository
  ) {}

  async search(q: string): Promise<PackageSummary[]> {
    return q.trim().length < 2 ? [] : this.packages.search(q.trim());
  }

  /** Everything the package page needs, fetched concurrently. */
  async getProfile(name: string): Promise<PackageProfile | null> {
    const pkg = await this.packages.findByName(name);
    if (!pkg) return null;
    const [deps, dependents, advisories, treeAdvisories] = await Promise.all([
      this.packages.findDependencies(name),
      this.packages.findDependents(name),
      this.advisories.findByPackage(name),
      this.packages.findTreeAdvisories(name),
    ]);
    return { pkg, deps, dependents, advisories, treeAdvisories };
  }
}
