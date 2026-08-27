import prisma from "@/lib/prisma";
import { isExecutiveOrAdmin } from "@/lib/role-access";

export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";
export const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";

export function googleOauthScopesForRole(role: string | null | undefined): string[] {
  if (isExecutiveOrAdmin(role)) {
    return [GOOGLE_CALENDAR_EVENTS_SCOPE, GOOGLE_TASKS_SCOPE];
  }
  return [GOOGLE_CALENDAR_EVENTS_SCOPE];
}

export function hasGoogleTasksScope(oauthScopes: string | null | undefined): boolean {
  if (!oauthScopes?.trim()) return false;
  return oauthScopes.split(/[\s,]+/).includes(GOOGLE_TASKS_SCOPE);
}

export function googleOAuthRedirectUri(): string {
  const base =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}/api/integrations/google-calendar/callback`;
}

export function buildGoogleOAuthAuthUrl(clientId: string, scopes: string[]): string {
  const redirectUri = googleOAuthRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** 만료 전이면 저장 토큰, 아니면 refresh. refresh 실패 시 null */
export async function getValidGoogleAccessToken(userId: string): Promise<string | null> {
  const row = await prisma.googleCalendarIntegration.findUnique({
    where: { userId },
  });
  if (!row) return null;
  const now = new Date();
  if (row.expiresAt && row.expiresAt > now) {
    return row.accessToken;
  }
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!row.refreshToken || !clientId || !clientSecret) return row.accessToken;

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!refreshRes.ok) return null;
  const data = (await refreshRes.json()) as { access_token: string; expires_in?: number };
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
  await prisma.googleCalendarIntegration.update({
    where: { userId },
    data: { accessToken: data.access_token, expiresAt },
  });
  return data.access_token;
}
