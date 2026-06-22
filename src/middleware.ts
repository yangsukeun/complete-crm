import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/login", "/api/auth"];
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
  if (pathname === "/manifest.json" || pathname === "/manifest.webmanifest") return true;
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  /** 레거시/캐시된 OG 아이콘 경로 호환 */
  if (pathname === "/assets/favicon/og-270.png") {
    const url = request.nextUrl.clone();
    url.pathname = "/og-image.png";
    const res = NextResponse.rewrite(url);
    res.headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    return res;
  }

  /**
   * OneSignal 호스트 SW — next.config headers만으로 CDN에서 빠지는 경우가 있어
   * 응답에 Service-Worker-Allowed 를 미들웨어에서도 명시 (루트 scope 등록 허용).
   */
  if (pathname === "/OneSignalSDKWorker.js" || pathname === "/OneSignalSDKUpdaterWorker.js") {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Service-Worker-Allowed", "/");
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  }

  /** 예전 PWA·캐시가 /manifest.json 을 요청하면 웹 매니페스트로 보냄(304로 구버전 고착 방지) */
  if (pathname === "/manifest.json") {
    const res = NextResponse.redirect(new URL("/manifest.webmanifest", request.url), 308);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  }

  /* 브라우저 기본 /favicon.ico 요청도 DB 로고와 맞춤 (matcher에서 제외돼 있으면 여기까지 오지 않음) */
  if (pathname === "/favicon.ico") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/branding/favicon";
    return NextResponse.rewrite(url);
  }

  // 잘못된 URL /app/login/... → /login/... 로 리다이렉트 (Next.js App Router는 URL에 /app 이 없음)
  if (pathname.startsWith("/app/login")) {
    const newPath = pathname.replace(/^\/app/, "") || "/login";
    return NextResponse.redirect(new URL(newPath, request.url));
  }

  /** 공개 회원가입 비활성 — 직원 계정은 관리자가 /admin/employees 에서만 생성 */
  if (pathname === "/signup" || pathname.startsWith("/signup/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPublic(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  /** JWT 디코드 — 쿠키 이름 변형·__Host- 등으로 hasAuthCookie만으로는 놓치는 세션 보강 (푸시 딥링크 등) */
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (secret) {
    try {
      const token = await getToken({
        req: request,
        secret,
        secureCookie: process.env.NODE_ENV === "production",
      });
      if (token) {
        return NextResponse.next({ request: { headers: requestHeaders } });
      }
    } catch {
      /* 쿠키 없음·만료 등 → 아래 폴백 */
    }
  }

  if (hasAuthCookie(request)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  const loginUrl = new URL("/login", request.url);
  const returnTo = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("callbackUrl", returnTo);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  /* favicon.ico 포함 — rewrite로 /api/branding/favicon 처리 */
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/assets/favicon/og-270.png",
  ],
};
