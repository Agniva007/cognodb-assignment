import { dashboardController } from "@/controllers";

export async function GET() {
  return dashboardController.overview();
}
