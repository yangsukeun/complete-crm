import { NextResponse } from "next/server";
import { authorizationServerMetadata, publicOrigin } from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** OAuth 인가 서버 메타데이터(RFC 8414) — CRM MCP 연결용 */
export async function GET(req: Request) {
  return NextResponse.json(authorizationServerMetadata(publicOrigin(req)));
}
