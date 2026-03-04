import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth"];
const DEV_SESSION_COOKIE = "dev_user_id";
const NEXTAUTH_COOKIES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

function isPublic(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function hasAuthCookie(request: NextRequest): boolean {
  if (request.cookies.get(DEV_SESSION_COOKIE)?.value) return true;
  if (NEXTAUTH_COOKIES.some((name) => request.cookies.get(name)?.value)) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
  runtime: "edge",
};
