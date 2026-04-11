"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef } from "react";
import { isLikelyOneSignalSubscriptionId } from "@/lib/onesignal/subscription-id";
import { clearProfileMeCache } from "@/lib/profile-me-client";

type OneSignalDefault = typeof import("react-onesignal")["default"];

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
 */
export function OneSignalPushTokenRegister() {
  const { data: session, status } = useSession();
  const changeCleanupRef = useRef<(() => void) | null>(null);

  const registerWithIds = useCallback(
    async (crmUserId: string, subscriptionId: string, onesignalUserId: string | null, externalId: string | null) => {
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
      for (let i = 0; i < maxAttempts; i++) {
        const ids = await resolveSubscriptionId(OneSignal);
        subscriptionId = ids.subscriptionId;
        onesignalUserId = ids.onesignalUserId;
        externalId = ids.externalId;
        if (subscriptionId) break;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      console.log("[TOKEN] 구독 ID(폴링 종료):", subscriptionId ?? "(없음)");
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

    const onSessionReady = (ev: Event) => {
      const d = (ev as CustomEvent<{ userId?: string }>).detail;
      if (d?.userId !== userId) return;
      console.log("[TOKEN] crm-onesignal-session-ready → 등록 시도");
      void tryDeferredAndReact(userId).catch((e) => console.error("[TOKEN] 에러:", e));
    };
    window.addEventListener("crm-onesignal-session-ready", onSessionReady);

    const timer = setTimeout(() => {
      console.log("[TOKEN] 백업 타이머(이벤트 없을 때 등록 시도)");
      void tryDeferredAndReact(userId).catch((e) => console.error("[TOKEN] 에러:", e));
    }, 8000);

    return () => {
      window.removeEventListener("crm-onesignal-session-ready", onSessionReady);
      clearTimeout(timer);
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
