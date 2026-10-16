import { NextResponse } from "next/server";
import { OAuthError, registerClient } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

/** POST /api/mcp-oauth/register — 동적 클라이언트 등록(RFC 7591) */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(await registerClient(body), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof OAuthError) {
      return NextResponse.json({ error: e.code, error_description: e.message }, { status: e.status });
    }
    console.error("[mcp-oauth] register", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
