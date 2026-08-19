import { NextRequest } from "next/server";
import { advisoryController } from "@/controllers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return advisoryController.show(decodeURIComponent(id));
}
