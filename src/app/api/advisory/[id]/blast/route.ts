import { NextRequest } from "next/server";
import { advisoryController } from "@/controllers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return advisoryController.blastRadius(req, decodeURIComponent(id));
}
