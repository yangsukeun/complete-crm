import "server-only";

import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import prisma from "@/lib/prisma";

/**
 * ChatGPT·Claude 같은 외부 AI 앱이 CRM MCP 서버(/api/mcp)에 직원 계정으로 접속하기 위한 OAuth 2.1.
 *
 * DB 테이블 없이 서명된 JWT로만 동작한다(무상태).
 * - client_id  : 등록한 redirect_uri 목록을 서명해 둔 값(동적 클라이언트 등록, RFC 7591)
 * - authreq    : 동의 화면까지 들고 가는 인가 요청(10분)
 * - code       : 인가 코드(5분, PKCE S256 필수)
 * - access     : MCP 호출용 토큰(1시간)
 * - refresh    : 재발급 토큰(30일)
 *
 * 토큰에는 비밀번호 해시에서 뽑은 지문(pv)을 넣는다. 비밀번호를 바꾸면 발급된 토큰이 모두 무효가 된다.
 * 계정이 비활성(퇴사 등)이면 호출할 때마다 막는다.
 */

export const MCP_SCOPE = "crm";
const ISSUER_TAG = "crm-mcp";

const TTL = {
  authreq: 10 * 60,
  code: 5 * 60,
  access: 60 * 60,
  refresh: 30 * 24 * 60 * 60,
} as const;

type TokenType = "client" | "authreq" | "code" | "access" | "refresh";

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

function signingKey(): Uint8Array {
  const secret =
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    (process.env.NODE_ENV === "development" ? "dev-secret-change-in-production" : undefined);
  if (!secret) throw new Error("AUTH_SECRET이 없어 MCP 토큰을 서명할 수 없습니다.");
  // 로그인 세션 JWT와 키를 분리한다
  return new Uint8Array(createHash("sha256").update(`crm-mcp-oauth-v1:${secret}`).digest());
}

async function sign(typ: TokenType, payload: Record<string, unknown>, ttlSec?: number): Promise<string> {
  const jwt = new SignJWT({ ...payload, typ }).setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER_TAG).setIssuedAt();
  if (ttlSec) jwt.setExpirationTime(`${ttlSec}s`);
  return jwt.sign(signingKey());
}

async function verify<T>(typ: TokenType, token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), { issuer: ISSUER_TAG, algorithms: ["HS256"] });
    if (payload.typ !== typ) return null;
    return payload as T;
  } catch {
    return null;
  }
}

/** 요청이 들어온 주소 기준 공개 URL(Vercel 프록시 헤더 우선) */
export function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function mcpResourceUrl(origin: string): string {
  return `${origin}/api/mcp`;
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/mcp-oauth/authorize`,
    token_endpoint: `${origin}/api/mcp-oauth/token`,
    registration_endpoint: `${origin}/api/mcp-oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [MCP_SCOPE],
    // RFC 9207: 리다이렉트에 iss를 붙인다(ChatGPT는 이때 고정 콜백 주소를 쓴다)
    authorization_response_iss_parameter_supported: true,
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpResourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "회사 CRM",
  };
}

// ── 클라이언트 등록 ──────────────────────────────────────────

/** 리다이렉트를 허용하는 AI 앱 도메인. 필요하면 MCP_OAUTH_REDIRECT_HOSTS(쉼표 구분)로 추가한다 */
function allowedRedirectHosts(): string[] {
  const extra = (process.env.MCP_OAUTH_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return ["chatgpt.com", "chat.openai.com", "openai.com", "claude.ai", "claude.com", ...extra];
}

export function isAllowedRedirectUri(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash) return false;
  const host = u.hostname.toLowerCase();
  if (u.protocol === "http:") return host === "localhost" || host === "127.0.0.1";
  if (u.protocol !== "https:") return false;
  return allowedRedirectHosts().some((h) => host === h || host.endsWith(`.${h}`));
}

type ClientClaims = { redirect_uris: string[]; client_name: string };

export async function registerClient(body: Record<string, unknown>) {
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (redirectUris.length === 0 || redirectUris.length > 10) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris가 필요합니다.");
  }
  const bad = redirectUris.find((u) => !isAllowedRedirectUri(u));
  if (bad) throw new OAuthError("invalid_redirect_uri", `허용되지 않은 redirect_uri입니다: ${bad}`);
  const clientName = String(body.client_name ?? "AI 앱").slice(0, 80);
  const clientId = await sign("client", { redirect_uris: redirectUris, client_name: clientName });
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

async function loadClient(clientId: string): Promise<ClientClaims> {
  const c = await verify<ClientClaims>("client", clientId);
  if (!c) throw new OAuthError("invalid_client", "등록되지 않은 클라이언트입니다. 앱에서 연결을 다시 만들어 주세요.", 401);
  return c;
}

// ── 인가 요청 ────────────────────────────────────────────────

export type AuthRequest = {
  client_id: string;
  client_name: string;
  redirect_uri: string;
  code_challenge: string;
  state: string | null;
  scope: string;
  resource: string | null;
};

/** /authorize 쿼리를 검증해 서명된 요청으로 만든다. redirect_uri 검증 전 오류는 화면에 직접 보여 준다 */
export async function parseAuthorizeQuery(params: URLSearchParams): Promise<string> {
  const clientId = params.get("client_id") ?? "";
  const client = await loadClient(clientId);
  const redirectUri = params.get("redirect_uri") ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : "");
  if (!client.redirect_uris.includes(redirectUri)) {
    throw new OAuthError("invalid_request", "redirect_uri가 등록한 값과 다릅니다.");
  }
  if (params.get("response_type") !== "code") throw new OAuthError("unsupported_response_type", "response_type=code만 지원합니다.");
  const challenge = params.get("code_challenge") ?? "";
  if (!challenge || (params.get("code_challenge_method") ?? "plain") !== "S256") {
    throw new OAuthError("invalid_request", "PKCE(S256)가 필요합니다.");
  }
  const request: AuthRequest = {
    client_id: clientId,
    client_name: client.client_name,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    state: params.get("state"),
    scope: MCP_SCOPE,
    resource: params.get("resource"),
  };
  return sign("authreq", request, TTL.authreq);
}

export async function readAuthRequest(token: string): Promise<AuthRequest> {
  const r = await verify<AuthRequest>("authreq", token);
  if (!r) throw new OAuthError("invalid_request", "연결 요청이 만료되었습니다. AI 앱에서 다시 연결해 주세요.");
  return r;
}

export function redirectWithParams(redirectUri: string, params: Record<string, string | null>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

// ── 사용자 지문 ──────────────────────────────────────────────

type UserRow = { id: string; name: string; role: string; password: string; accountDisabled: boolean };

function passwordVersion(user: UserRow): string {
  return createHash("sha256").update(`${user.id}:${user.password}`).digest("base64url").slice(0, 16);
}

async function loadActiveUser(userId: string): Promise<UserRow | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, password: true, accountDisabled: true },
  });
  if (!user || user.accountDisabled) return null;
  return user;
}

export async function issueCode(request: AuthRequest, userId: string): Promise<string> {
  const user = await loadActiveUser(userId);
  if (!user) throw new OAuthError("access_denied", "사용할 수 없는 계정입니다.", 403);
  return sign(
    "code",
    {
      sub: user.id,
      pv: passwordVersion(user),
      client_id: request.client_id,
      redirect_uri: request.redirect_uri,
      code_challenge: request.code_challenge,
      scope: request.scope,
      aud: request.resource,
    },
    TTL.code
  );
}

// ── 토큰 발급 ────────────────────────────────────────────────

type CodeClaims = {
  sub: string;
  pv: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  aud?: string | null;
};

type RefreshClaims = { sub: string; pv: string; client_id: string; scope: string; aud?: string | null };

function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function tokenResponse(user: UserRow, clientId: string, scope: string, aud: string | null | undefined) {
  const claims = { sub: user.id, pv: passwordVersion(user), client_id: clientId, scope, ...(aud ? { aud } : {}) };
  const accessToken = await sign("access", claims, TTL.access);
  const refreshToken = await sign("refresh", claims, TTL.refresh);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TTL.access,
    refresh_token: refreshToken,
    scope,
  };
}

export async function exchangeToken(form: URLSearchParams) {
  const grantType = form.get("grant_type");
  if (grantType === "authorization_code") {
    const code = await verify<CodeClaims>("code", form.get("code") ?? "");
    if (!code) throw new OAuthError("invalid_grant", "인가 코드가 올바르지 않거나 만료되었습니다.");
    const clientId = form.get("client_id");
    if (clientId && clientId !== code.client_id) throw new OAuthError("invalid_grant", "client_id가 다릅니다.");
    const redirectUri = form.get("redirect_uri");
    if (redirectUri && redirectUri !== code.redirect_uri) throw new OAuthError("invalid_grant", "redirect_uri가 다릅니다.");
    const verifier = form.get("code_verifier") ?? "";
    if (!verifier || s256(verifier) !== code.code_challenge) throw new OAuthError("invalid_grant", "PKCE 검증에 실패했습니다.");
    const user = await loadActiveUser(code.sub);
    if (!user || passwordVersion(user) !== code.pv) throw new OAuthError("invalid_grant", "계정 상태가 바뀌었습니다. 다시 연결해 주세요.");
    return tokenResponse(user, code.client_id, code.scope, code.aud);
  }
  if (grantType === "refresh_token") {
    const rt = await verify<RefreshClaims>("refresh", form.get("refresh_token") ?? "");
    if (!rt) throw new OAuthError("invalid_grant", "재발급 토큰이 만료되었습니다. 다시 연결해 주세요.");
    const clientId = form.get("client_id");
    if (clientId && clientId !== rt.client_id) throw new OAuthError("invalid_grant", "client_id가 다릅니다.");
    const user = await loadActiveUser(rt.sub);
    if (!user || passwordVersion(user) !== rt.pv) throw new OAuthError("invalid_grant", "계정 상태가 바뀌었습니다. 다시 연결해 주세요.");
    return tokenResponse(user, rt.client_id, rt.scope, rt.aud);
  }
  throw new OAuthError("unsupported_grant_type", "지원하지 않는 grant_type입니다.");
}

// ── MCP 호출 인증 ────────────────────────────────────────────

export type McpViewer = { id: string; name: string; role: string };

export async function authenticateBearer(req: Request): Promise<McpViewer | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const claims = await verify<RefreshClaims>("access", m[1]);
  if (!claims) return null;
  const user = await loadActiveUser(claims.sub);
  if (!user || passwordVersion(user) !== claims.pv) return null;
  return { id: user.id, name: user.name, role: user.role };
}

export function unauthorizedHeaders(origin: string): Record<string, string> {
  return {
    "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp", scope="${MCP_SCOPE}"`,
  };
}
