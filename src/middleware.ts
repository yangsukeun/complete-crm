import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth"];
const NEXTAUTH_COOKIES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  // NextAuth v5(Auth.js) 쿠키명
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "__Host-authjs.session-token",
  // 일부 환경(커스텀 secret·trustHost)에서 다른 prefix 사용 가능
  "next-auth.session-token.0",
  "__Secure-next-auth.session-token.0",
];

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;
  // PWA manifest / 푸시 SW — 인증 없이 원본(JSON·JS)이 나가야 함 (리다이렉트 시 콘솔 Manifest·worker 오류)
  if (pathname === "/manifest.json") return true;
  if (pathname === "/OneSignalSDKWorker.js" || pathname === "/OneSignalSDKUpdaterWorker.js") return true;
  if (pathname.startsWith("/push/onesignal/")) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function hasAuthCookie(request: NextRequest): boolean {
  // 명시적 쿠키 이름 확인
  if (NEXTAUTH_COOKIES.some((name) => request.cookies.get(name)?.value)) return true;
  // 패턴 매칭 — 환경에 따라 이름이 변형되어도 감지
  for (const [name, cookie] of request.cookies) {
    if (!cookie?.value) continue;
    const n = name.toLowerCase();
    if (
      n.includes("session-token") ||
      n.includes("next-auth") ||
      n.includes("authjs")
    ) {
      return true;
    }
  }
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /* 브라우저 기본 /favicon.ico 요청도 DB 로고와 맞춤 (matcher에서 제외돼 있으면 여기까지 오지 않음) */
  if (pathname === "/favicon.ico") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/branding/favicon";
    return NextResponse.rewrite(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // 잘못된 URL /app/login/... → /login/... 로 리다이렉트 (Next.js App Router는 URL에 /app 이 없음)
  if (pathname.startsWith("/app/login")) {
    const newPath = pathname.replace(/^\/app/, "") || "/login";
    return NextResponse.redirect(new URL(newPath, request.url));
  }

  if (isPublic(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (hasAuthCookie(request)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  /* favicon.ico 포함 — rewrite로 /api/branding/favicon 처리 */
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
