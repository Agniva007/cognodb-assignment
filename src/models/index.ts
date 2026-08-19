/**
 * Domain models — the shapes the application reasons about.
 * Repositories return these; services compose them; controllers serialize them.
 */

export interface PackageSummary {
  name: string;
  description: string;
  weeklyDownloads: number;
  latestVersion: string;
}

export interface PackageDetail extends PackageSummary {
  license: string;
  maintainers: string[];
}

export interface Dependency {
  name: string;
  range: string;
  weeklyDownloads: number;
}

export interface Dependent {
  name: string;
  weeklyDownloads: number;
}

export interface AdvisorySummary {
  id: string;
  summary: string;
  severity: string;
  url: string;
  packageName: string;
  vulnerableRange: string;
}

export interface AdvisoryDetail extends AdvisorySummary {
  cvss: number | null;
  publishedAt: string;
}

/** An advisory reachable through the dependency tree, with its exposure chain. */
export interface TreeAdvisory {
  id: string;
  summary: string;
  severity: string;
  url: string;
  packageName: string;
  distance: number;
  exampleChain: string[];
}

export interface RankedAdvisory {
  id: string;
  summary: string;
  severity: string;
  url: string;
  packageName: string;
  downstream: number;
}

export interface BlastNode {
  name: string;
  weeklyDownloads: number;
  /** hops from the vulnerable package (0 = the vulnerable package itself) */
  distance: number;
  /** number of distinct dependency paths reaching this package */
  chains: number;
}

export interface BlastEdge {
  from: string;
  to: string;
}

export interface BlastRadius {
  nodes: BlastNode[];
  edges: BlastEdge[];
}

export interface DependencyPath {
  chain: string[];
}

export interface ChokePoint {
  name: string;
  weeklyDownloads: number;
  maintainer: string;
  exposedTop: number;
}

/** Severity histogram + dependency counts for one package's tree. */
export interface PackageHealth {
  directDependencies: number;
  transitiveDependencies: number;
  /** advisories anywhere in the tree, grouped by severity (highest first) */
  bySeverity: Array<{ severity: string; count: number }>;
}

/**
 * Two maintainers whose packages keep turning up inside the same dependency
 * trees — a correlated-risk pair rather than a single point of failure.
 */
export interface MaintainerCluster {
  maintainerA: string;
  maintainerB: string;
  /** how many popular packages depend on work by both */
  sharedTrees: number;
  /** a few of those trees, for illustration */
  examples: string[];
}

export interface GraphStats {
  packages: number;
  advisories: number;
  edges: number;
  maintainers: number;
}

export interface PopularPackage extends PackageSummary {
  directDependents: number;
}
