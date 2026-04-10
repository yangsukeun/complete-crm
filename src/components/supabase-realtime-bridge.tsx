"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  resetSharedSupabaseRealtime,
  subscribeFinanceRealtime,
  subscribeGlobalPresence,
} from "@/lib/supabase/realtime-client";

/**
 * ChatMessage Realtime 은 `ChatPageClient`에서 구독(전역 인박스 + 방 단위).
 * 여기서는 자금·presence 만 처리해 pathname 과 무관하게 항상 동일하게 동작.
 */
export function SupabaseRealtimeBridge() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";

  useEffect(() => {
    if (!session?.user?.id) {
      resetSharedSupabaseRealtime();
      return;
    }
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    let cancelled = false;
    let financeRt: { unsubscribe: () => void } | null = null;
    let presenceRt: { unsubscribe: () => void } | null = null;
    let financeDebounce: ReturnType<typeof setTimeout> | null = null;

    const scheduleFinanceRefresh = () => {
      if (financeDebounce) clearTimeout(financeDebounce);
      financeDebounce = setTimeout(() => {
        financeDebounce = null;
        if (!cancelled) window.dispatchEvent(new Event("finance-alerts-refresh"));
      }, 280);
    };

    void (async () => {
      const fr = await subscribeFinanceRealtime(session.user!.id, role, scheduleFinanceRefresh);
      if (!cancelled && fr) financeRt = fr;

      const userName = (session.user as { name?: string | null })?.name ?? "";
      const pr = await subscribeGlobalPresence(session.user!.id, userName, (onlineIds) => {
        if (!cancelled) {
          window.dispatchEvent(
            new CustomEvent("chat-presence-update", { detail: { onlineIds } })
          );
        }
      });
      if (!cancelled && pr) presenceRt = pr;
    })();

    return () => {
      cancelled = true;
      if (financeDebounce) clearTimeout(financeDebounce);
      try {
        financeRt?.unsubscribe();
      } catch {
        /* */
      }
      try {
        presenceRt?.unsubscribe();
      } catch {
        /* */
      }
    };
  }, [session?.user?.id, role]);

  return null;
}
