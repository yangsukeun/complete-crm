import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAppSession } from "@/auth";
import {
  getAppBaseUrl,
  naverCalendarOAuthConfigured,
  naverCalendarRedirectUri,
} from "@/lib/naver-calendar-oauth";

export async function GET() {
  const session = await getAppSession();
  const base = getAppBaseUrl();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login?callbackUrl=/schedule", base));
  }
  if (!naverCalendarOAuthConfigured()) {
    return NextResponse.redirect(new URL("/schedule?error=naver_calendar_not_configured", base));
  }

  const clientId = process.env.NAVER_CALENDAR_CLIENT_ID!;
  const state = crypto.randomUUID();
  const redirectUri = encodeURIComponent(naverCalendarRedirectUri());
  const url = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${redirectUri}&state=${encodeURIComponent(state)}`;

  const cookieStore = await cookies();
  cookieStore.set("naver_calendar_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(url);
}
