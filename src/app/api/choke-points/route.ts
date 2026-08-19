import { NextRequest } from "next/server";
import { dashboardController } from "@/controllers";

export async function GET(req: NextRequest) {
  return dashboardController.chokePoints(req);
}
