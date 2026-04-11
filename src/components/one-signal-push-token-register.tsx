"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef } from "react";
import { clearProfileMeCache } from "@/lib/profile-me-client";

type OneSignalDefault = typeof import("react-onesignal")["default"];

type WindowWithDeferred = Window & {
  OneSignalDeferred?: Array<(oneSignal: unknown) => void | Promise<void>>;
};

async function resolveSubscriptionId(OS: OneSignalDefault): Promise<{
  subscriptionId: string | null;
  onesignalUserId: string | null;
  externalId: string | null;
}> {
  const sub = OS.User?.PushSubscription;
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

  if (!subscriptionId) {
    const rawToken = sub?.token;
    const tok =
      typeof rawToken === "string" && rawToken.trim()
        ? rawToken.trim()
        : rawToken != null && String(rawToken).trim()
          ? String(rawToken).trim()
          : null;
    if (tok && tok.length >= 8) subscriptionId = tok;
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

      const ok = res.ok && data?.ok === true && data?.skipped !== true;
      if (ok) {
        await fetch("/api/profile/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ playerId: subscriptionId, oneSignalPlayerId: subscriptionId }),
        }).catch(() => null);
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
      const w = window as WindowWithDeferred;
      w.OneSignalDeferred = w.OneSignalDeferred ?? [];
      const deferred = w.OneSignalDeferred;
      if (Array.isArray(deferred)) {
        console.log("[TOKEN] OneSignalDeferred 있음 (큐 길이:", deferred.length, ")");
        deferred.push(async (os: unknown) => {
          console.log("[TOKEN] Deferred 콜백 os:", os);
          const o = os as {
            User?: { PushSubscription?: { id?: string }; onesignalId?: string; externalId?: string };
          };
          const id = o?.User?.PushSubscription?.id;
          console.log("[TOKEN] 구독 ID(Deferred):", id);
          if (typeof id === "string" && id.trim().length >= 8) {
            await registerWithIds(
              userId,
              id.trim(),
              o.User?.onesignalId?.trim() ?? null,
              o.User?.externalId?.trim() ?? null
            );
          }
        });
      }

      const OneSignal = (await import("react-onesignal")).default;
      let subscriptionId: string | null = null;
      let onesignalUserId: string | null = null;
      let externalId: string | null = null;
      for (let i = 0; i < 24; i++) {
        const ids = await resolveSubscriptionId(OneSignal);
        subscriptionId = ids.subscriptionId;
        onesignalUserId = ids.onesignalUserId;
        externalId = ids.externalId;
        if (subscriptionId) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      console.log("[TOKEN] 구독 ID(react-onesignal):", subscriptionId);
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

    const timer = setTimeout(() => {
      console.log("[TOKEN] 타이머 실행");
      void tryDeferredAndReact(userId).catch((e) => console.error("[TOKEN] 에러:", e));
    }, 5000);

    return () => clearTimeout(timer);
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
          }, 2000);
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

    const t = setTimeout(() => void armListener(), 6000);
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
