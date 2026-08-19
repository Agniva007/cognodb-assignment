import type { GraphRepository } from "@/repositories/GraphRepository";
import type { DependencyPath } from "@/models";

/** Path-finding use-case: "how does package A end up pulling in package B?" */
export class PathService {
  constructor(private readonly graph: GraphRepository) {}

  async findExposureChain(from: string, to: string): Promise<DependencyPath[]> {
    return this.graph.findShortestPath(from.trim(), to.trim());
  }
}
