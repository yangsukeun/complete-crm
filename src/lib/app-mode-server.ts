import type { cookies } from "next/headers";
import prisma from "@/lib/prisma";

export type AppMode = "company" | "personal";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * 쿠키 app_mode가 없거나 잘못된 경우 User.lastAppMode로 복구 (다른 기기·시크릿 창 등).
 */
export async function resolveAppModeForUser(
  userId: string,
  cookieStore: CookieStore
): Promise<AppMode | null> {
  const raw = cookieStore.get("app_mode")?.value;
  if (raw === "company" || raw === "personal") return raw;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastAppMode: true },
    });
    const m = user?.lastAppMode;
    if (m === "company" || m === "personal") return m;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("lastAppMode") || msg.includes("Unknown column") || msg.includes("Unknown arg")) {
      return null;
    }
    throw e;
  }
  return null;
}
