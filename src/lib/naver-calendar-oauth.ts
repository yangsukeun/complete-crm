import prisma from "@/lib/prisma";

export function getAppBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export function naverCalendarOAuthConfigured(): boolean {
  return Boolean(
    process.env.NAVER_CALENDAR_CLIENT_ID?.trim() &&
      process.env.NAVER_CALENDAR_CLIENT_SECRET?.trim()
  );
}

export function naverCalendarRedirectUri(): string {
  return `${getAppBaseUrl()}/api/integrations/naver-calendar/callback`;
}

type NaverTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: string | number;
  error?: string;
  error_description?: string;
};

function parseExpiresAt(expiresIn: string | number | undefined): Date | null {
  if (expiresIn == null) return null;
  const sec = typeof expiresIn === "string" ? Number(expiresIn) : expiresIn;
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return new Date(Date.now() + sec * 1000);
}

export async function exchangeNaverAuthorizationCode(code: string, state: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}> {
  const clientId = process.env.NAVER_CALENDAR_CLIENT_ID!;
  const clientSecret = process.env.NAVER_CALENDAR_CLIENT_SECRET!;
  const tokenRes = await fetch("https://nid.naver.com/oauth2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: naverCalendarRedirectUri(),
      code,
      state,
    }),
  });
  const data = (await tokenRes.json()) as NaverTokenResponse;
  if (!tokenRes.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "Naver token exchange failed");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: parseExpiresAt(data.expires_in),
  };
}

export async function getValidNaverAccessToken(userId: string): Promise<string | null> {
  const row = await prisma.naverCalendarIntegration.findUnique({ where: { userId } });
  if (!row) return null;

  const now = new Date();
  if (row.expiresAt && row.expiresAt > now) {
    return row.accessToken;
  }

  const clientId = process.env.NAVER_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.NAVER_CALENDAR_CLIENT_SECRET;
  if (!row.refreshToken || !clientId || !clientSecret) {
    return row.accessToken;
  }

  const refreshRes = await fetch("https://nid.naver.com/oauth2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refreshToken,
    }),
  });
  const data = (await refreshRes.json()) as NaverTokenResponse;
  if (!refreshRes.ok || !data.access_token) {
    console.error("[naver-calendar] token refresh failed", data);
    return null;
  }

  const expiresAt = parseExpiresAt(data.expires_in);
  await prisma.naverCalendarIntegration.update({
    where: { userId },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? row.refreshToken,
      expiresAt,
    },
  });
  return data.access_token;
}
