export type OneSignalLike = {
  User?: {
    PushSubscription?: {
      id?: unknown;
      optedIn?: unknown;
      optOut?: () => Promise<void>;
    };
  };
};

function getWindowOneSignal(): OneSignalLike | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { OneSignal?: OneSignalLike }).OneSignal ?? null;
}

function getWindowDeferred(): unknown[] | null {
  if (typeof window === "undefined") return null;
  const d = (window as Window & { OneSignalDeferred?: unknown }).OneSignalDeferred;
  return Array.isArray(d) ? d : null;
}

function readSubscriptionId(os: OneSignalLike | null): string | null {
  const raw = os?.User?.PushSubscription?.id;
  const s = typeof raw === "string" ? raw.trim() : raw != null ? String(raw).trim() : "";
  return s.length > 0 ? s : null;
}

async function optOut(os: OneSignalLike | null): Promise<void> {
  try {
    await os?.User?.PushSubscription?.optOut?.();
  } catch {
    /* ignore */
  }
}

/**
 * 로그아웃 직전 실행:
 * - OneSignal Push 구독 optOut(브라우저에서 수신 차단)
 * - 서버 DB에서 해당 유저의 구독 ID 제거(가능하면 현재 기기 1개만 제거)
 */
export async function onesignalOptOutAndDeregister(): Promise<void> {
  const direct = getWindowOneSignal();
  let subscriptionId: string | null = readSubscriptionId(direct);

  // SDK가 아직 로드 전이면 OneSignalDeferred로 1회 기다려서 optOut + id 회수 시도
  if (!direct) {
    const deferred = getWindowDeferred();
    if (deferred) {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        const t = window.setTimeout(finish, 1200);
        deferred.push(async (os: OneSignalLike) => {
          subscriptionId = readSubscriptionId(os);
          await optOut(os);
          window.clearTimeout(t);
          finish();
        });
      });
    }
  } else {
    await optOut(direct);
  }

  try {
    await fetch("/api/user/onesignal-register", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(subscriptionId ? { subscriptionId } : {}),
    });
  } catch {
    /* ignore */
  }
}

