"use client";

import { useEffect, useRef } from "react";
import OneSignal from "react-onesignal";

function clientDebug(): boolean {
  return (
    typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_DEBUG_ONESIGNAL === "1" || process.env.NODE_ENV === "development")
  );
}

function logClient(step: string, payload?: Record<string, unknown>) {
  if (clientDebug()) {
    console.log(`[OneSignal client] ${step}`, payload ?? "");
  }
}

/** Web v16: Player/구독 ID는 주로 PushSubscription.id, 구(getUserId) 타입은 런타임에만 존재할 수 있음 */
async function resolveIdsForBackend(): Promise<{
  subscriptionId: string | null;
  onesignalUserId: string | null;
  getUserIdLegacy: string | null;
}> {
  let getUserIdLegacy: string | null = null;
  try {
    const anyOs = OneSignal as unknown as { getUserId?: () => Promise<string | undefined> };
    if (typeof anyOs.getUserId === "function") {
      const v = await anyOs.getUserId().catch(() => undefined);
      getUserIdLegacy = v?.trim() || null;
    }
  } catch {
    /* */
  }
  const rawSub = OneSignal.User?.PushSubscription?.id;
  const subscriptionId =
    typeof rawSub === "string" && rawSub.trim()
      ? rawSub.trim()
      : rawSub != null && String(rawSub).trim()
        ? String(rawSub).trim()
        : null;
  const onesignalUserId = OneSignal.User?.onesignalId?.trim() || null;
  try {
    const u = OneSignal.User as unknown as { getOnesignalId?: () => Promise<string | undefined> };
    if (!getUserIdLegacy && typeof u.getOnesignalId === "function") {
      const v = await u.getOnesignalId().catch(() => undefined);
      getUserIdLegacy = v?.trim() || null;
    }
  } catch {
    /* */
  }
  return { subscriptionId, onesignalUserId, getUserIdLegacy };
}

/**
 * 브라우저에서 OneSignal을 한 번 초기화하고, 로그인 시 external_id(User.id)와 맞춥니다.
 * 서버 푸시(`include_aliases.external_id`)와 동일한 값이어야 합니다.
 *
 * 연결 위치: app/layout.tsx → Providers (`src/components/providers.tsx`) 안에서 마운트됨. (_app.tsx 없음, App Router)
 */
export function OneSignalBridge({ userId }: { userId?: string | null }) {
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) {
      logClient("① 스킵: NEXT_PUBLIC_ONESIGNAL_APP_ID 없음");
      return;
    }

    logClient("① init 시작", { appId: `${appId.slice(0, 8)}…` });

    if (!initPromiseRef.current) {
      initPromiseRef.current = OneSignal.init({
        appId,
        serviceWorkerPath: "/OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/" },
        allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
        welcomeNotification: { disable: true, message: "" },
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: "push",
                autoPrompt: false,
                delay: { pageViews: 1, timeDelay: 0 },
              },
            ],
          },
        },
      })
        .then(() => {
          if (clientDebug() && OneSignal.Debug?.setLogLevel) {
            try {
              OneSignal.Debug.setLogLevel("debug");
            } catch {
              /* ignore */
            }
          }
          logClient("② init 완료", { serviceWorker: "/OneSignalSDKWorker.js" });
        })
        .catch((err) => {
          const msg = typeof err === "string" ? err : String(err?.message ?? err);
          if (msg.includes("already initialized")) {
            logClient("② init 이미 됨 (already initialized)");
            return undefined;
          }
          console.error("[OneSignal] init 실패:", err);
          throw err;
        });
    }
  }, []);

  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId || !initPromiseRef.current) return;

    let cancelled = false;

    const reportState = async (reason: string) => {
      if (cancelled) return;
      try {
        const ext = OneSignal.User?.externalId ?? null;
        const optedIn = OneSignal.User?.PushSubscription?.optedIn ?? null;
        const { subscriptionId: subId, onesignalUserId: oneId, getUserIdLegacy } =
          await resolveIdsForBackend();
        const playerForDb =
          (getUserIdLegacy || subId || oneId)?.trim() || null;
        const logPayload = {
          externalId: ext,
          onesignalUserId: oneId,
          subscriptionId: subId,
          getUserIdLegacy,
          optedIn,
          playerForDb,
          patchField: "playerId + oneSignalPlayerId → PATCH /api/profile/me",
          expectExternalIdMatchUserId: userId ?? null,
        };
        logClient(`⑧ 구독·Player ID (${reason})`, logPayload);
        if (process.env.NODE_ENV === "production") {
          console.log("[OneSignal CRM bridge]", reason, {
            hasGetUserId: Boolean(getUserIdLegacy),
            hasSubscriptionId: Boolean(subId),
            willPatchProfile: Boolean(playerForDb && userId),
          });
        }

        if (subId || oneId || getUserIdLegacy) {
          await fetch("/api/user/onesignal-register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscriptionId: subId ?? "",
              onesignalUserId: oneId ?? "",
              externalId: ext ?? "",
            }),
          }).catch((e) => console.error("[OneSignal] register API 실패", e));
        }

        if (playerForDb && userId) {
          const patchRes = await fetch("/api/profile/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId: playerForDb, oneSignalPlayerId: playerForDb }),
          }).catch((e) => {
            console.error("[OneSignal] profile playerId PATCH 실패", e);
            return null;
          });
          if (clientDebug() && patchRes && !patchRes.ok) {
            console.warn("[OneSignal] PATCH /api/profile/me", patchRes.status, await patchRes.text().catch(() => ""));
          }
        }
      } catch (e) {
        console.error("[OneSignal] reportState 실패", e);
      }
    };

    void initPromiseRef.current.then(async () => {
      if (cancelled) return;
      try {
        if (userId) {
          logClient("③ login 호출 전", { userId });
          await OneSignal.login(userId);
          logClient("④ login 완료 (external_id = User.id)", { userId });
          try {
            await OneSignal.Notifications?.requestPermission?.();
          } catch (permErr) {
            logClient("알림 권한 요청 실패/미지원", { err: String(permErr) });
          }
          try {
            await OneSignal.User?.PushSubscription?.optIn?.();
          } catch {
            /* ignore */
          }
          reportedRef.current = false;
          setTimeout(() => void reportState("login+1.5s"), 1500);
          setTimeout(() => void reportState("login+4s"), 4000);
          setTimeout(() => void reportState("login+8s"), 8000);
          try {
            OneSignal.User?.PushSubscription?.addEventListener?.("change", () => {
              void reportState("PushSubscription.change");
            });
          } catch {
            /* ignore */
          }
          try {
            OneSignal.User?.addEventListener?.("change", () => {
              void reportState("User.change");
            });
          } catch {
            /* ignore */
          }
        } else {
          logClient("③ logout (비로그인)");
          await OneSignal.logout();
        }
      } catch (e) {
        console.error("[OneSignal] login/logout 실패:", e);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}
