"use client";

import { useEffect, useState } from "react";

/** OneSignal Deferred 콜백용 최소 타입 (디버그 전용) */
type OneSignalDebugOs = {
  Notifications?: { permission?: boolean | string };
  User?: {
    PushSubscription?: { optedIn?: boolean; id?: string | null };
  };
};

type WindowWithDeferred = Window & {
  OneSignalDeferred?: Array<(onesignal: OneSignalDebugOs) => void | Promise<void>>;
};

export default function DebugPush() {
  const [logs, setLogs] = useState<string[]>([]);

  const log = (msg: string) => {
    setLogs((prev) => [...prev, `${new Date().toISOString().slice(11, 23)} ${msg}`]);
  };

  useEffect(() => {
    const w = window as WindowWithDeferred;
    log("페이지 로드됨");
    log("OneSignal 타입: " + typeof (window as Window & { OneSignal?: unknown }).OneSignal);
    log("OneSignalDeferred 타입: " + typeof w.OneSignalDeferred);

    const t = setTimeout(() => {
      if (w.OneSignalDeferred) {
        w.OneSignalDeferred.push(async (os: OneSignalDebugOs) => {
          log("os 초기화됨");
          log("권한: " + String(os.Notifications?.permission ?? "(없음)"));
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
    </div>
  );
}
