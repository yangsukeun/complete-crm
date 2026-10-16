import { NextResponse } from "next/server";
import { protectedResourceMetadata, publicOrigin } from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 9728 경로 방식(/.well-known/oauth-protected-resource/api/mcp) */
export async function GET(req: Request) {
  return NextResponse.json(protectedResourceMetadata(publicOrigin(req)));
}
