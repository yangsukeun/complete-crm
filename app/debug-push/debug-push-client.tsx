"use client";

import { useEffect, useState } from "react";

/** OneSignal Deferred 콜백용 최소 타입 (디버그 전용) */
type OneSignalDebugOs = {
  Notifications?: {
    permission?: boolean | string;
    requestPermission?: () => Promise<unknown>;
  };
  User?: {
    PushSubscription?: {
      optedIn?: boolean;
      id?: string | null;
      optIn?: () => Promise<void>;
    };
  };
};

type WindowWithDeferred = Window & {
  OneSignalDeferred?: Array<(onesignal: OneSignalDebugOs) => void | Promise<void>>;
};

export function DebugPushClient() {
  const [logs, setLogs] = useState<string[]>([]);

  const log = (msg: string) => {
    setLogs((prev) => [...prev, `${new Date().toISOString().slice(11, 23)} ${msg}`]);
  };

  useEffect(() => {
    const w = window as WindowWithDeferred;
    log("페이지 로드됨");
    log("OneSignal 타입: " + typeof (window as Window & { OneSignal?: unknown }).OneSignal);
    log("OneSignalDeferred 타입: " + typeof w.OneSignalDeferred);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        log("SW 수: " + regs.length);
        regs.forEach((r, i) => {
          log("SW" + i + " scope: " + r.scope);
          log("SW" + i + " state: " + (r.active?.state ?? "(active 없음)"));
        });
      });
    } else {
      log("SW 미지원");
    }

    log("Notification 지원: " + String("Notification" in window));
    if ("Notification" in window) {
      log("현재 권한: " + Notification.permission);
    }

    const t = setTimeout(() => {
      if (w.OneSignalDeferred) {
        w.OneSignalDeferred.push(async (os: OneSignalDebugOs) => {
          log("os 초기화됨");
          log("권한: " + String(os.Notifications?.permission ?? "(없음)"));
          try {
            await os.User?.PushSubscription?.optIn?.();
            log("자동 점검: optIn 호출됨");
          } catch (e: unknown) {
            log("자동 점검: optIn 실패 " + (e instanceof Error ? e.message : String(e)));
          }
          await new Promise((r) => setTimeout(r, 1500));
          log("optedIn: " + String(os.User?.PushSubscription?.optedIn ?? "(없음)"));
          log("구독ID: " + String(os.User?.PushSubscription?.id ?? "(없음)"));

          const id = os.User?.PushSubscription?.id;
          if (id) {
            const res = await fetch("/api/user/onesignal-register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ subscriptionId: id }),
            });
            const data = await res.json().catch(() => ({}));
            log("등록결과: " + JSON.stringify(data));
          } else {
            log("구독 ID 없음 — 등록 스킵");
          }
        });
      } else {
        log("OneSignalDeferred 없음!");
      }
    }, 3000);

    return () => clearTimeout(t);
  }, []);

  const requestPermission = async () => {
    log("버튼 클릭됨");

    if ("Notification" in window) {
      log("Notification API 있음");
      log("현재 권한: " + Notification.permission);
      try {
        const result = await Notification.requestPermission();
        log("네이티브 권한 결과: " + result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log("네이티브 권한 에러: " + msg);
      }
    } else {
      log("Notification API 없음");
    }

    if ("serviceWorker" in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        log("SW 등록 수: " + regs.length);
        regs.forEach((r, i) => {
          log("SW " + i + ": " + r.scope);
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log("SW 조회 에러: " + msg);
      }
    }

    const w = window as WindowWithDeferred;
    if (!w.OneSignalDeferred) {
      log("OneSignalDeferred 없음");
      return;
    }

    w.OneSignalDeferred.push(async (os: OneSignalDebugOs) => {
      log("OS 권한·optIn 시작");
      try {
        await os.Notifications?.requestPermission?.();
        log("OS 권한 요청 완료");

        try {
          await os.User?.PushSubscription?.optIn?.();
          log("optIn 완료");
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          log("optIn 실패: " + msg);
        }

        await new Promise((r) => setTimeout(r, 2000));

        const id = os.User?.PushSubscription?.id;
        log("구독ID: " + (id || "없음"));

        if (id) {
          const res = await fetch("/api/user/onesignal-register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ subscriptionId: id }),
          });
          const data = await res.json().catch(() => ({}));
          log("등록: " + JSON.stringify(data));
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log("OS 에러: " + msg);
      }
    });
  };

  const registerServiceWorkerManual = async () => {
    log("SW 수동 등록 시작");
    if (!("serviceWorker" in navigator)) {
      log("SW 미지원");
      return;
    }
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        const scope = r.scope;
        await r.unregister();
        log("기존 SW 해제: " + scope);
      }

      const reg = await navigator.serviceWorker.register("/OneSignalSDKWorker.js", { scope: "/" });
      log("SW 등록 성공: " + reg.scope);

      await new Promise((r) => setTimeout(r, 3000));

      const regs2 = await navigator.serviceWorker.getRegistrations();
      log("등록 후 SW 수: " + regs2.length);

      const w = window as WindowWithDeferred;
      if (w.OneSignalDeferred) {
        w.OneSignalDeferred.push(async (os: OneSignalDebugOs) => {
          try {
            await os.User?.PushSubscription?.optIn?.();
            log("optIn 완료 (SW 수동 후)");
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            log("optIn 실패: " + msg);
          }

          await new Promise((r) => setTimeout(r, 2000));

          const id = os.User?.PushSubscription?.id;
          log("구독ID: " + (id || "없음"));
          log("optedIn: " + String(os.User?.PushSubscription?.optedIn ?? "(없음)"));

          if (id) {
            const res = await fetch("/api/user/onesignal-register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ subscriptionId: id }),
            });
            const data = await res.json().catch(() => ({}));
            log("DB 등록결과: " + JSON.stringify(data));
          }
        });
      } else {
        log("OneSignalDeferred 없음");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log("SW 등록 실패: " + msg);
    }
  };

  return (
    <div className="p-4">
      <h1 className="mb-4 text-lg font-bold">Push 디버그</h1>
      <p className="mb-2 text-sm text-muted-foreground">
        임시 진단용. 확인 후 삭제하거나 접근 제한을 두세요.
      </p>
      <div className="space-y-1">
        {logs.map((l, i) => (
          <div key={i} className="rounded bg-black p-1 font-mono text-sm text-green-400">
            {l}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void requestPermission()}
        style={{
          marginTop: "16px",
          padding: "12px 24px",
          background: "blue",
          color: "white",
          fontSize: "18px",
          borderRadius: "8px",
          border: "none",
          width: "100%",
        }}
      >
        알림 권한 요청하기
      </button>
      <button
        type="button"
        onClick={() => void registerServiceWorkerManual()}
        style={{
          marginTop: "8px",
          padding: "14px",
          background: "#16a34a",
          color: "white",
          fontSize: "16px",
          fontWeight: "bold",
          borderRadius: "8px",
          width: "100%",
          border: "none",
          cursor: "pointer",
        }}
      >
        🔧 서비스 워커 수동 등록
      </button>
    </div>
  );
}
