import type { AdvisoryRepository } from "@/repositories/AdvisoryRepository";
import type { AdvisoryDetail, BlastRadius } from "@/models";

/** Advisory use-cases: detail lookup and blast-radius assembly. */
export class AdvisoryService {
  constructor(private readonly advisories: AdvisoryRepository) {}

  async getById(id: string): Promise<AdvisoryDetail | null> {
    return this.advisories.findById(id);
  }

  /**
   * Assemble the blast-radius graph: the vulnerable root, every downstream
   * package within `hops`, and the dependency edges among them.
   */
  async getBlastRadius(id: string, hops = 4): Promise<BlastRadius> {
    const [root, downstream] = await Promise.all([
      this.advisories.findRootPackage(id),
      this.advisories.findBlastNodes(id, hops),
    ]);
    const nodes = [...root, ...downstream];
    const edges = await this.advisories.findEdgesAmong(nodes.map((n) => n.name));
    return { nodes, edges };
  }
}
