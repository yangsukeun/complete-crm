import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import {
  issueCode,
  OAuthError,
  parseAuthorizeQuery,
  publicOrigin,
  readAuthRequest,
  redirectWithParams,
  type AuthRequest,
} from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/mcp-oauth/authorize — AI 앱 연결 동의 화면. 로그인하지 않았으면 CRM 로그인으로 보냈다가 돌아온다.
 * POST /api/mcp-oauth/authorize — 허용/거부 → AI 앱으로 인가 코드를 돌려준다.
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;font-family:Pretendard,system-ui,-apple-system,"Malgun Gothic",sans-serif;background:#f4f5f7;color:#1f2937}
main{max-width:440px;margin:10vh auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 12px}p,li{font-size:14px;line-height:1.6;color:#4b5563}ul{padding-left:18px}
.row{display:flex;gap:8px;margin-top:20px}button{flex:1;padding:11px;border-radius:10px;border:1px solid #d1d5db;font-size:15px;cursor:pointer;background:#fff}
button.primary{background:#2563eb;border-color:#2563eb;color:#fff}.muted{font-size:12px;color:#9ca3af;margin-top:16px}
@media (prefers-color-scheme:dark){body{background:#111827;color:#e5e7eb}main{background:#1f2937}p,li{color:#cbd5e1}button{background:#374151;color:#e5e7eb;border-color:#4b5563}}
</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" },
  });
}

function errorPage(message: string): Response {
  return page("연결 오류", `<h1>연결할 수 없습니다</h1><p>${escapeHtml(message)}</p>`, 400);
}

function consentPage(reqToken: string, request: AuthRequest, user: { name?: string | null; email?: string | null }): Response {
  const host = new URL(request.redirect_uri).host;
  return page(
    "AI 앱 연결",
    `<h1>${escapeHtml(request.client_name)}에 CRM을 연결할까요?</h1>
<p><b>${escapeHtml(user.name ?? "")}</b>${user.email ? ` (${escapeHtml(user.email)})` : ""} 계정으로 연결합니다.</p>
<ul>
<li>내 담당 단계, 볼 수 있는 프로젝트 단계 현황, 내 알림을 읽습니다.</li>
<li>내 단계 진행 저장·완료 처리를 할 수 있습니다(실행 전에 AI 앱이 확인을 받습니다).</li>
<li>CRM 화면과 같은 권한만 가집니다.</li>
</ul>
<form method="post">
<input type="hidden" name="req" value="${escapeHtml(reqToken)}">
<div class="row"><button type="submit" name="decision" value="deny">거부</button>
<button type="submit" name="decision" value="allow" class="primary">허용</button></div>
</form>
<p class="muted">연결 후 돌아갈 주소: ${escapeHtml(host)}<br>연결을 끊으려면 AI 앱에서 연결을 삭제하거나 CRM 비밀번호를 바꾸세요.</p>`
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  let reqToken = url.searchParams.get("req");
  try {
    if (!reqToken) reqToken = await parseAuthorizeQuery(url.searchParams);
    const request = await readAuthRequest(reqToken);

    const session = await getAppSession();
    if (!session?.user?.id) {
      const login = new URL("/login", publicOrigin(req));
      login.searchParams.set("callbackUrl", `/api/mcp-oauth/authorize?req=${reqToken}`);
      return NextResponse.redirect(login);
    }
    return consentPage(reqToken, request, session.user);
  } catch (e) {
    if (e instanceof OAuthError) return errorPage(e.message);
    console.error("[mcp-oauth] authorize GET", e);
    return errorPage("연결 요청을 처리하지 못했습니다.");
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const request = await readAuthRequest(String(form.get("req") ?? ""));
    const session = await getAppSession();
    if (!session?.user?.id) return errorPage("CRM 로그인이 풀렸습니다. AI 앱에서 다시 연결해 주세요.");

    const iss = publicOrigin(req);
    if (form.get("decision") !== "allow") {
      return NextResponse.redirect(
        redirectWithParams(request.redirect_uri, { error: "access_denied", state: request.state, iss }),
        303
      );
    }
    const code = await issueCode(request, session.user.id);
    return NextResponse.redirect(redirectWithParams(request.redirect_uri, { code, state: request.state, iss }), 303);
  } catch (e) {
    if (e instanceof OAuthError) return errorPage(e.message);
    console.error("[mcp-oauth] authorize POST", e);
    return errorPage("연결 요청을 처리하지 못했습니다.");
  }
}
