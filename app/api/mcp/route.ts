import { NextResponse } from "next/server";
import { authenticateBearer, publicOrigin, unauthorizedHeaders } from "@/lib/mcp/oauth";
import { handleMcpBody } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/mcp — ChatGPT 등 AI 앱용 MCP 서버(Streamable HTTP, 무상태 JSON 응답).
 * 직원별 OAuth 토큰(Bearer)으로 인증하고, 도구는 그 직원 권한으로만 동작한다.
 */
export async function POST(req: Request) {
  const origin = publicOrigin(req);
  const viewer = await authenticateBearer(req);
  if (!viewer) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "CRM 로그인이 필요합니다." } },
      { status: 401, headers: unauthorizedHeaders(origin) }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON 형식이 올바르지 않습니다." } }, { status: 400 });
  }

  const result = await handleMcpBody(body, viewer, origin);
  if (result === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

/** 서버→클라이언트 스트림(SSE)은 쓰지 않는다 */
export async function GET(req: Request) {
  const origin = publicOrigin(req);
  if (!(await authenticateBearer(req))) {
    return new NextResponse(null, { status: 401, headers: unauthorizedHeaders(origin) });
  }
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
