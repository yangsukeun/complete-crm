import { NextResponse } from "next/server";
import { protectedResourceMetadata, publicOrigin } from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 보호 리소스 메타데이터(RFC 9728) — /api/mcp 가 어떤 인가 서버를 쓰는지 알린다 */
export async function GET(req: Request) {
  return NextResponse.json(protectedResourceMetadata(publicOrigin(req)));
}
