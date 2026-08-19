import { NextRequest } from "next/server";
import { packageController } from "@/controllers";

export async function GET(req: NextRequest) {
  return packageController.search(req);
}
