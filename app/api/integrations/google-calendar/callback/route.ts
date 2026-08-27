import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { googleOauthScopesForRole } from "@/lib/google-oauth";

const BASE_URL = process.env.NEXTAUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export async function GET(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/login?callbackUrl=/schedule", BASE_URL));
    }
    const code = req.nextUrl.searchParams.get("code");
    if (!code) {
      return NextResponse.redirect(new URL("/schedule?error=google_calendar_denied", BASE_URL));
    }
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL("/schedule?error=google_calendar_not_configured", BASE_URL));
    }
    const redirectUri = `${BASE_URL}/api/integrations/google-calendar/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Google token exchange failed", err);
      return NextResponse.redirect(new URL("/schedule?error=google_calendar_token", BASE_URL));
    }
    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const expiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000)
      : null;
    const oauthScopes =
      token.scope?.trim() || googleOauthScopesForRole(session.user.role).join(" ");

    await prisma.googleCalendarIntegration.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt,
        oauthScopes,
      },
      update: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? undefined,
        expiresAt,
        oauthScopes,
      },
    });

    return NextResponse.redirect(new URL("/schedule?google_calendar=connected", BASE_URL));
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(new URL("/schedule?error=google_calendar_failed", BASE_URL));
  }
}
