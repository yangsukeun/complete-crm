import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { SWR_KEYS } from "@/lib/api-swr";

/** layout 1회 부트스트랩 — 클라이언트에서 /api/mode·logo·unread-count 반복 호출 완화 */
export type HeaderBootstrapData = {
  appMode: "company" | "personal" | null;
  logoUrl: string | null;
  notificationUnreadCount: number | null;
};

// [PERF-mode-logo] GET /api/mode·/api/settings/logo 응답 shape — SWR fallback과 동일해야 네트워크 0회
export type ModeApiPayload = { mode: string | null };
export type LogoSettingsApiPayload = { logoUrl: string | null };

export type SwrModeLogoFallback = {
  "/api/mode": ModeApiPayload;
  "/api/settings/logo": LogoSettingsApiPayload;
};

export function buildSwrModeLogoFallback(b: HeaderBootstrapData): SwrModeLogoFallback {
  return {
    "/api/mode": { mode: b.appMode },
    "/api/settings/logo": { logoUrl: b.logoUrl },
  };
}

// [PERF-mode-logo] 알림 unread — NotificationBell과 동일 키·shape
export type NotificationUnreadPayload = { count: number };

export type SwrLayoutFallback = SwrModeLogoFallback &
  Partial<Record<typeof SWR_KEYS.notificationUnread, NotificationUnreadPayload>>;

/** RSC 1회 스냅샷 → SWRConfig.fallback + 클라 캐시 시드 동기 키 */
export function buildSwrLayoutFallback(
  b: HeaderBootstrapData,
  sessionUserId: string | undefined
): SwrLayoutFallback {
  const base = buildSwrModeLogoFallback(b);
  if (!sessionUserId || typeof b.notificationUnreadCount !== "number") {
    return base;
  }
  return {
    ...base,
    [SWR_KEYS.notificationUnread]: { count: b.notificationUnreadCount },
  };
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/** 헤더 로고·파비콘 공통 — 세션 없이도 탭 아이콘에 회사 로고 반영 */
export async function getCompanyLogoUrl(): Promise<string | null> {
  try {
    const company = await prisma.companyInfo.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { logoUrl: true },
    });
    return company?.logoUrl ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (
      msg.includes("Unknown column") ||
      msg.includes("Unknown field") ||
      msg.includes("logoUrl")
    ) {
      return null;
    }
    throw e;
  }
}

// [PERF-auto] layout에서 cookies()와 auth() 병렬 시 이미 조회한 CookieStore 전달
export async function getHeaderBootstrapData(
  sessionUserId: string | undefined,
  cookieStore?: CookieStore
): Promise<HeaderBootstrapData> {
  const store = cookieStore ?? (await cookies());
  const raw = store.get("app_mode")?.value;
  let appMode: "company" | "personal" | null =
    raw === "company" || raw === "personal" ? raw : null;

  if (!sessionUserId) {
    return { appMode, logoUrl: null, notificationUnreadCount: null };
  }

  if (!appMode) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { lastAppMode: true },
      });
      const m = user?.lastAppMode;
      if (m === "company" || m === "personal") appMode = m;
    } catch {
      /* 마이그레이션 전·DB 오류 시 쿠키만 사용 */
    }
  }

  let logoUrl: string | null = null;
  let notificationUnreadCount: number | null = null;

  logoUrl = await getCompanyLogoUrl();

  try {
    notificationUnreadCount = await prisma.notification.count({
      where: { userId: sessionUserId, isRead: false },
    });
  } catch {
    notificationUnreadCount = 0;
  }

  return { appMode, logoUrl, notificationUnreadCount };
}
