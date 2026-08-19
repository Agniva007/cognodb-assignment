import { NextRequest } from "next/server";
import { packageController } from "@/controllers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  return packageController.show(decodeURIComponent(name));
}
