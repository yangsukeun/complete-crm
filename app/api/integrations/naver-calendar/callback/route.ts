import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import {
  exchangeNaverAuthorizationCode,
  getAppBaseUrl,
  naverCalendarOAuthConfigured,
} from "@/lib/naver-calendar-oauth";

export async function GET(req: NextRequest) {
  const base = getAppBaseUrl();
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/login?callbackUrl=/schedule", base));
    }

    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const error = req.nextUrl.searchParams.get("error");
    if (error || !code) {
      return NextResponse.redirect(new URL("/schedule?error=naver_calendar_denied", base));
    }
    if (!naverCalendarOAuthConfigured()) {
      return NextResponse.redirect(new URL("/schedule?error=naver_calendar_not_configured", base));
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get("naver_calendar_oauth_state")?.value;
    cookieStore.delete("naver_calendar_oauth_state");
    if (!state || !savedState || state !== savedState) {
      return NextResponse.redirect(new URL("/schedule?error=naver_calendar_state", base));
    }

    const token = await exchangeNaverAuthorizationCode(code, state);
    await prisma.naverCalendarIntegration.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
      },
      update: {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken ?? undefined,
        expiresAt: token.expiresAt,
      },
    });

    return NextResponse.redirect(new URL("/schedule?naver_calendar=connected", base));
  } catch (e) {
    console.error("[naver-calendar] callback", e);
    return NextResponse.redirect(new URL("/schedule?error=naver_calendar_failed", base));
  }
}
