import { NextRequest, NextResponse } from "next/server";
import { Controller } from "./Controller";
import {
  advisoryService,
  dashboardService,
  packageService,
  pathService,
} from "@/lib/container";

class PackageController extends Controller {
  async search(req: NextRequest): Promise<NextResponse> {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    return this.respond(() => packageService.search(q));
  }

  async show(name: string): Promise<NextResponse> {
    return this.respondOr404(
      () => packageService.getProfile(name),
      `Package "${name}" is not in the graph.`
    );
  }
}

class AdvisoryController extends Controller {
  async show(id: string): Promise<NextResponse> {
    return this.respondOr404(
      () => advisoryService.getById(id),
      `Advisory "${id}" is not in the graph.`
    );
  }

  async blastRadius(req: NextRequest, id: string): Promise<NextResponse> {
    const hops = Number(req.nextUrl.searchParams.get("hops") ?? 4);
    return this.respond(() =>
      advisoryService.getBlastRadius(id, Number.isFinite(hops) ? hops : 4)
    );
  }
}

class DashboardController extends Controller {
  async overview(): Promise<NextResponse> {
    return this.respond(() => dashboardService.getOverview());
  }

  async chokePoints(req: NextRequest): Promise<NextResponse> {
    const minDownloads = Number(req.nextUrl.searchParams.get("minDownloads") ?? 1_000_000);
    const k = Number(req.nextUrl.searchParams.get("k") ?? 5);
    return this.respond(() =>
      dashboardService.getChokePoints(
        Number.isFinite(minDownloads) ? minDownloads : 1_000_000,
        Number.isFinite(k) ? k : 5
      )
    );
  }

  async health(): Promise<NextResponse> {
    return this.respond(async () => ({ up: await dashboardService.isHealthy() }));
  }
}

class PathController extends Controller {
  async trace(req: NextRequest): Promise<NextResponse> {
    const from = req.nextUrl.searchParams.get("from")?.trim();
    const to = req.nextUrl.searchParams.get("to")?.trim();
    if (!from || !to) return this.badRequest("Both 'from' and 'to' are required.");
    return this.respond(() => pathService.findExposureChain(from, to));
  }
}

export const packageController = new PackageController();
export const advisoryController = new AdvisoryController();
export const dashboardController = new DashboardController();
export const pathController = new PathController();
