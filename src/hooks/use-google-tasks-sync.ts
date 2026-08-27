"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/api-swr";
import { isExecutiveOrAdmin } from "@/lib/role-access";
import { toast } from "sonner";

export type GoogleTasksSyncStatus = {
  enabled: boolean;
  connected?: boolean;
  needsReauth?: boolean;
  lastSyncedAt?: string | null;
  authUrl?: string | null;
};

const TEN_MIN_MS = 10 * 60 * 1000;

export function useGoogleTasksSync(opts?: { auto?: boolean; onSynced?: () => void }) {
  const { data: session } = useSession();
  const enabledRole = isExecutiveOrAdmin(session?.user?.role);
  const { data, mutate, isLoading } = useSWR<GoogleTasksSyncStatus>(
    enabledRole ? "/api/google-tasks/sync" : null,
    jsonFetcher,
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );
  const [syncing, setSyncing] = useState(false);
  const autoRan = useRef(false);
  const onSyncedRef = useRef(opts?.onSynced);
  onSyncedRef.current = opts?.onSynced;

  const runSync = useCallback(
    async (force: boolean) => {
      if (!data?.enabled || !data.connected || data.needsReauth) return;
      setSyncing(true);
      try {
        const res = await fetch(
          force ? "/api/google-tasks/sync?force=1" : "/api/google-tasks/sync",
          { method: "POST", credentials: "include" }
        );
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          created?: number;
          updated?: number;
          needsReauth?: boolean;
        };
        if (!res.ok) {
          if (body.needsReauth) {
            void mutate();
            toast.error(body.error || "구글 할일 권한이 없습니다. 다시 연결해 주세요.");
            return;
          }
          throw new Error(body.error || "가져오기에 실패했습니다.");
        }
        void mutate();
        onSyncedRef.current?.();
        if (force) {
          const n = (body.created ?? 0) + (body.updated ?? 0);
          toast.success(n > 0 ? `구글 할일 ${n}건을 반영했습니다.` : "새 구글 할일이 없습니다.");
        }
      } catch (e) {
        if (force) toast.error(e instanceof Error ? e.message : "가져오기에 실패했습니다.");
      } finally {
        setSyncing(false);
      }
    },
    [data?.enabled, data?.connected, data?.needsReauth, mutate]
  );

  useEffect(() => {
    if (!opts?.auto || autoRan.current) return;
    if (!data?.enabled || !data.connected || data.needsReauth) return;
    const last = data.lastSyncedAt ? new Date(data.lastSyncedAt).getTime() : 0;
    if (last > 0 && Date.now() - last < TEN_MIN_MS) return;
    autoRan.current = true;
    void runSync(false);
  }, [opts?.auto, data, runSync]);

  const showUi = Boolean(data?.enabled);
  return {
    showUi,
    connected: Boolean(data?.connected),
    needsReauth: Boolean(data?.needsReauth),
    authUrl: data?.authUrl ?? null,
    lastSyncedAt: data?.lastSyncedAt ?? null,
    syncing,
    loading: isLoading,
    importNow: () => runSync(true),
  };
}
