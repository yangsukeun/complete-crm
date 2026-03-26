"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  resetSharedSupabaseRealtime,
  subscribeChatMessagesGlobal,
  subscribeFinanceRealtime,
} from "@/lib/supabase/realtime-client";

/**
 * 채팅방 목록·헤더 배지용: ChatMessage Realtime → 브라우저 전역 이벤트 (폴링 대체).
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
    let channel: { unsubscribe: () => void } | null = null;
    let financeRt: { unsubscribe: () => void } | null = null;
    let financeDebounce: ReturnType<typeof setTimeout> | null = null;

    const scheduleFinanceRefresh = () => {
      if (financeDebounce) clearTimeout(financeDebounce);
      financeDebounce = setTimeout(() => {
        financeDebounce = null;
        if (!cancelled) window.dispatchEvent(new Event("finance-alerts-refresh"));
      }, 280);
    };

    void (async () => {
      const ch = await subscribeChatMessagesGlobal(session.user!.id, ({ chatId, payload }) => {
        if (cancelled) return;
        window.dispatchEvent(
          new CustomEvent("chat-realtime", {
            detail: { chatId, payload },
          })
        );
        window.dispatchEvent(new Event("chat-inbox-refresh"));
      });
      if (!cancelled && ch) {
        channel = ch;
      }
      const fr = await subscribeFinanceRealtime(session.user!.id, role, scheduleFinanceRefresh);
      if (!cancelled && fr) financeRt = fr;
    })();

    return () => {
      cancelled = true;
      if (financeDebounce) clearTimeout(financeDebounce);
      try {
        channel?.unsubscribe();
      } catch {
        /* */
      }
      try {
        financeRt?.unsubscribe();
      } catch {
        /* */
      }
    };
  }, [session?.user?.id, role]);

  return null;
}
