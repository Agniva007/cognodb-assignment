/**
 * Composition root — the one place where the object graph is wired.
 * Everything below is constructor-injected, so any layer can be unit-tested
 * against a fake of the layer beneath it.
 */
import { Database } from "./db";
import { AdvisoryRepository } from "@/repositories/AdvisoryRepository";
import { GraphRepository } from "@/repositories/GraphRepository";
import { PackageRepository } from "@/repositories/PackageRepository";
import { AdvisoryService } from "@/services/AdvisoryService";
import { DashboardService } from "@/services/DashboardService";
import { PackageService } from "@/services/PackageService";
import { PathService } from "@/services/PathService";

const db = Database.getInstance();

const packageRepository = new PackageRepository(db);
const advisoryRepository = new AdvisoryRepository(db);
const graphRepository = new GraphRepository(db);

export const packageService = new PackageService(packageRepository, advisoryRepository);
export const advisoryService = new AdvisoryService(advisoryRepository);
export const dashboardService = new DashboardService(
  graphRepository,
  advisoryRepository,
  packageRepository
);
export const pathService = new PathService(graphRepository);
