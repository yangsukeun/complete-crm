"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef } from "react";
import { isLikelyOneSignalSubscriptionId } from "@/lib/onesignal/subscription-id";
import { clearProfileMeCache } from "@/lib/profile-me-client";

type OneSignalDefault = typeof import("react-onesignal")["default"];

const TOKEN_DEBUG_PANEL_ID = "crm-token-mobile-debug";

function isTokenMobileDebug(): boolean {
  return (
    typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_DEBUG_ONESIGNAL === "1" || process.env.NEXT_PUBLIC_DEBUG_TOKEN_MOBILE === "1")
  );
}

function formatTokenMobileArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

/** 배포 후 모바일에서 콘솔 없이 확인용 — NEXT_PUBLIC_DEBUG_TOKEN_MOBILE 또는 …DEBUG_ONESIGNAL=1 일 때만 */
function appendTokenMobilePanel(line: string): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById(TOKEN_DEBUG_PANEL_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = TOKEN_DEBUG_PANEL_ID;
    el.setAttribute("role", "log");
    el.setAttribute("aria-live", "polite");
    el.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "right:0",
      "background:#000",
      "color:#0f0",
      "font-size:11px",
      "z-index:2147483646",
      "padding:8px",
      "max-height:200px",
      "overflow-y:auto",
      "font-family:ui-monospace,monospace",
      "pointer-events:auto",
    ].join(";");
    document.body.appendChild(el);
  }
  const row = document.createElement("div");
  row.textContent = line;
  el.appendChild(row);
  el.scrollTop = el.scrollHeight;
}

function tokenMobileLog(...args: unknown[]): void {
  if (!isTokenMobileDebug()) return;
  console.log("[TOKEN-MOBILE]", ...args);
  appendTokenMobilePanel(formatTokenMobileArgs(args));
}

/** react-onesignal 래퍼는 window.OneSignal 게터를 쓰지만, 네이티브 객체에만 있는 비동기 API가 있을 수 있어 우선 조회합니다. */
function getNativePushSubscription(): unknown {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & { OneSignal?: { User?: { PushSubscription?: unknown } } };
  return w.OneSignal?.User?.PushSubscription;
}

async function resolveSubscriptionId(OS: OneSignalDefault): Promise<{
  subscriptionId: string | null;
  onesignalUserId: string | null;
  externalId: string | null;
}> {
  const sub = (getNativePushSubscription() as typeof OS.User.PushSubscription | undefined) ?? OS.User?.PushSubscription;
  const rawId = sub?.id;
  let subscriptionId =
    typeof rawId === "string" && rawId.trim()
      ? rawId.trim()
      : rawId != null && String(rawId).trim()
        ? String(rawId).trim()
        : null;

  try {
    const Sub = sub as unknown as {
      getId?: () => Promise<string | undefined>;
      getSubscriptionId?: () => Promise<string | undefined>;
    };
    if (!subscriptionId && typeof Sub?.getId === "function") {
      const v = await Sub.getId().catch(() => undefined);
      subscriptionId = v?.trim() || null;
    }
    if (!subscriptionId && typeof Sub?.getSubscriptionId === "function") {
      const v = await Sub.getSubscriptionId().catch(() => undefined);
      subscriptionId = v?.trim() || null;
    }
  } catch {
    /* */
  }

  if (subscriptionId && !isLikelyOneSignalSubscriptionId(subscriptionId)) {
    subscriptionId = null;
  }

  const onesignalUserId = OS.User?.onesignalId?.trim() || null;
  const externalId = OS.User?.externalId?.trim() || null;

  return { subscriptionId, onesignalUserId, externalId };
}

/**
 * SessionProvider 하위에서만 사용. 로그인 후 OneSignal 구독 ID를 서버에 등록 ([TOKEN] 로그로 단계 확인).
 * init 은 `OneSignalBridge`(DeferredRealtimeBridges)에서 수행 — 로그인 시 즉시 마운트되도록 함께 조정됨.
 *
 * 서버 등록 주 경로: `POST /api/user/onesignal-register` (본 저장 + Transfer).
 * 보조: `POST /api/onesignal/register` (동일 목적 별칭, playerId/subscriptionId).
 */
export function OneSignalPushTokenRegister() {
  const { data: session, status } = useSession();
  const changeCleanupRef = useRef<(() => void) | null>(null);

  const registerWithIds = useCallback(
    async (crmUserId: string, subscriptionId: string, onesignalUserId: string | null, externalId: string | null) => {
      tokenMobileLog("등록 API: POST /api/user/onesignal-register (주), POST /api/onesignal/register (별칭)");

      const res = await fetch("/api/user/onesignal-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subscriptionId,
          onesignalUserId: onesignalUserId ?? "",
          externalId: (externalId ?? crmUserId).trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      console.log("[TOKEN] 등록 결과(/api/user/onesignal-register):", { ok: res.ok, data });
      tokenMobileLog("onesignal-register 응답:", { ok: res.ok, data });

      if (res.ok && data?.ok === true && data?.skipped !== true) {
        clearProfileMeCache();
      }

      const aliasRes = await fetch("/api/onesignal/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ playerId: subscriptionId }),
      });
      const aliasData = await aliasRes.json().catch(() => ({}));
      console.log("[TOKEN] 등록 결과(/api/onesignal/register):", { ok: aliasRes.ok, data: aliasData });
      tokenMobileLog("onesignal/register(별칭) 응답:", { ok: aliasRes.ok, data: aliasData });
    },
    []
  );

  const tryDeferredAndReact = useCallback(
    async (userId: string) => {
      const OneSignal = (await import("react-onesignal")).default;

      let subscriptionId: string | null = null;
      let onesignalUserId: string | null = null;
      let externalId: string | null = null;
      /** optIn·권한 후 id가 늦게 채워지는 경우가 많아 v16 권장 대기 시간을 넉넉히 둠 */
      const maxAttempts = 60;
      const intervalMs = 500;
      let permissionKickDone = false;

      for (let i = 0; i < maxAttempts; i++) {
        const ids = await resolveSubscriptionId(OneSignal);
        subscriptionId = ids.subscriptionId;
        onesignalUserId = ids.onesignalUserId;
        externalId = ids.externalId;

        if (isTokenMobileDebug() && (i === 0 || i % 10 === 0)) {
          let perm: unknown = "(조회 안 함)";
          try {
            perm =
              typeof OneSignal.Notifications?.permission === "boolean"
                ? OneSignal.Notifications.permission
                : (OneSignal.Notifications as { getPermissionAsync?: () => Promise<string> })?.getPermissionAsync?.();
            if (perm instanceof Promise) perm = await perm.catch(() => "(실패)");
          } catch {
            perm = "(예외)";
          }
          const optedIn = (OneSignal.User?.PushSubscription as { optedIn?: boolean } | undefined)?.optedIn;
          tokenMobileLog(`폴링 ${i}/${maxAttempts}`, "permission:", perm, "optedIn:", optedIn, "id:", subscriptionId ?? "(없음)");
        }

        /** Bridge 이후에도 모바일에서 id가 늦는 경우: 한 번만 권한·optIn 재시도 */
        if (!subscriptionId && i >= 10 && !permissionKickDone) {
          permissionKickDone = true;
          tokenMobileLog("구독 ID 없음(~5s) — requestPermission·optIn 재시도");
          try {
            await OneSignal.Notifications?.requestPermission?.();
          } catch (e) {
            tokenMobileLog("requestPermission 실패:", String(e));
          }
          try {
            await OneSignal.User?.PushSubscription?.optIn?.();
          } catch (e) {
            tokenMobileLog("optIn 실패:", String(e));
          }
        }

        if (subscriptionId) break;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      console.log("[TOKEN] 구독 ID(폴링 종료):", subscriptionId ?? "(없음)");
      tokenMobileLog("구독 ID(폴링 종료):", subscriptionId ?? "(없음)");
      if (!subscriptionId) return;
      await registerWithIds(userId, subscriptionId, onesignalUserId, externalId);
    },
    [registerWithIds]
  );

  useEffect(() => {
    if (status === "loading") return;
    const userId = session?.user?.id;
    if (!userId || typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) {
      console.log("[TOKEN] 스킵: NEXT_PUBLIC_ONESIGNAL_APP_ID 없음");
      return;
    }

    console.log("[TOKEN] useEffect 실행됨", { userId });
    tokenMobileLog("useEffect 실행", { userId });
    tokenMobileLog("userAgent:", navigator.userAgent);
    const w = window as Window & { OneSignalDeferred?: unknown; OneSignal?: unknown };
    tokenMobileLog("OneSignalDeferred:", typeof w.OneSignalDeferred, "window.OneSignal:", typeof w.OneSignal);

    const snapshot5s = setTimeout(() => {
      tokenMobileLog("타이머 5s 스냅샷");
      void (async () => {
        try {
          const OS = (await import("react-onesignal")).default;
          const id = OS.User?.PushSubscription?.id ?? "(없음)";
          tokenMobileLog("5s PushSubscription.id:", id);
        } catch (e) {
          tokenMobileLog("5s 스냅샷 import 실패:", String(e));
        }
      })();
    }, 5000);

    const onSessionReady = (ev: Event) => {
      const d = (ev as CustomEvent<{ userId?: string }>).detail;
      if (d?.userId !== userId) return;
      console.log("[TOKEN] crm-onesignal-session-ready → 등록 시도");
      tokenMobileLog("crm-onesignal-session-ready → 등록 시도");
      void tryDeferredAndReact(userId).catch((e) => {
        console.error("[TOKEN] 에러:", e);
        tokenMobileLog("등록 시도 예외:", String(e));
      });
    };
    window.addEventListener("crm-onesignal-session-ready", onSessionReady);

    const timer = setTimeout(() => {
      console.log("[TOKEN] 백업 타이머(이벤트 없을 때 등록 시도)");
      tokenMobileLog("백업 타이머 8s — 등록 시도");
      void tryDeferredAndReact(userId).catch((e) => {
        console.error("[TOKEN] 에러:", e);
        tokenMobileLog("백업 타이머 등록 예외:", String(e));
      });
    }, 8000);

    return () => {
      window.removeEventListener("crm-onesignal-session-ready", onSessionReady);
      clearTimeout(timer);
      clearTimeout(snapshot5s);
    };
  }, [session?.user?.id, status, tryDeferredAndReact]);

  /** 구독 변경 시 재등록 */
  useEffect(() => {
    if (status === "loading" || !session?.user?.id) return;
    if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) return;

    const uid = session.user.id;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const armListener = async () => {
      try {
        const OneSignal = (await import("react-onesignal")).default;
        const subObj = OneSignal.User?.PushSubscription as
          | { addEventListener?: (ev: string, fn: () => void) => void; removeEventListener?: (ev: string, fn: () => void) => void }
          | undefined;
        const onChange = () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            void (async () => {
              if (cancelled) return;
              const ids = await resolveSubscriptionId(OneSignal);
              tokenMobileLog("PushSubscription change → id:", ids.subscriptionId ?? "(없음)");
              if (!ids.subscriptionId) return;
              await registerWithIds(uid, ids.subscriptionId, ids.onesignalUserId, ids.externalId);
            })();
          }, 600);
        };
        subObj?.addEventListener?.("change", onChange);
        changeCleanupRef.current = () => {
          subObj?.removeEventListener?.("change", onChange);
          if (debounce) clearTimeout(debounce);
        };
      } catch {
        /* */
      }
    };

    const t = setTimeout(() => void armListener(), 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
      changeCleanupRef.current?.();
      changeCleanupRef.current = null;
      if (debounce) clearTimeout(debounce);
    };
  }, [session?.user?.id, status, registerWithIds]);

  return null;
}
