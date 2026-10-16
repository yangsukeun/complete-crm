import { NextResponse } from "next/server";
import { exchangeToken, OAuthError } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

/** POST /api/mcp-oauth/token — 인가 코드(PKCE)·재발급 토큰으로 MCP 토큰 발급 */
export async function POST(req: Request) {
  const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };
  try {
    const type = req.headers.get("content-type") ?? "";
    const form = type.includes("application/json")
      ? new URLSearchParams(Object.entries((await req.json()) as Record<string, string>).map(([k, v]) => [k, String(v)]))
      : new URLSearchParams(await req.text());
    return NextResponse.json(await exchangeToken(form), { headers: noStore });
  } catch (e) {
    if (e instanceof OAuthError) {
      return NextResponse.json({ error: e.code, error_description: e.message }, { status: e.status, headers: noStore });
    }
    console.error("[mcp-oauth] token", e);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: noStore });
  }
}
