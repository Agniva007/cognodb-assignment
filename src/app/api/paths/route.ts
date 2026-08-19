import { NextRequest } from "next/server";
import { pathController } from "@/controllers";

export async function GET(req: NextRequest) {
  return pathController.trace(req);
}
