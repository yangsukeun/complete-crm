import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { buildGoogleOAuthAuthUrl, googleOauthScopesForRole } from "@/lib/google-oauth";

const BASE_URL = process.env.NEXTAUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

/** Google OAuth로 리다이렉트. 대표는 Tasks scope 포함 */
export async function GET() {
  const session = await getAppSession();
  if (!session?.user?.id) {
    const loginUrl = new URL("/login", BASE_URL);
    loginUrl.searchParams.set("callbackUrl", "/schedule");
    return NextResponse.redirect(loginUrl);
  }
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/schedule?error=google_calendar_not_configured", BASE_URL));
  }
  const url = buildGoogleOAuthAuthUrl(clientId, googleOauthScopesForRole(session.user.role));
  return NextResponse.redirect(url);
}
