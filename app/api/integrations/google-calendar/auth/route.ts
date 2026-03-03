import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";

const BASE_URL = process.env.NEXTAUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

/** Google OAuth로 리다이렉트 */
export async function GET(req: NextRequest) {
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
  const redirectUri = `${BASE_URL}/api/integrations/google-calendar/callback`;
  const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar.events.readonly");
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
  return NextResponse.redirect(url);
}
