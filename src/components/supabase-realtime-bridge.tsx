"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  resetSharedSupabaseRealtime,
  subscribeChatMessagesGlobal,
  subscribeFinanceRealtime,
  subscribeGlobalPresence,
} from "@/lib/supabase/realtime-client";
import type { RealtimeSubscriptionHandle } from "@/lib/supabase/realtime-client";

/**
 * ChatMessage 전역 구독: 모든 로그인 화면에서 `chat-inbox-refresh` / `chat-realtime` 발행.
 * (이전에는 `/chat` 에서만 구독해 다른 PC·모바일·다른 탭에서 채팅 알림이 안 오는 문제가 있었음.)
 * 방 단위 구독은 계속 `ChatPageClient`에서 처리.
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
    let chatGlobalRt: RealtimeSubscriptionHandle | null = null;
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

      const cg = await subscribeChatMessagesGlobal(session.user!.id, ({ chatId, payload }) => {
        if (cancelled) return;
        if (chatId) {
          window.dispatchEvent(
            new CustomEvent("chat-realtime", {
              detail: { chatId, payload },
            })
          );
        }
        window.dispatchEvent(new Event("chat-inbox-refresh"));
      });
      if (!cancelled && cg) chatGlobalRt = cg;
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
      try {
        chatGlobalRt?.unsubscribe();
      } catch {
        /* */
      }
    };
  }, [session?.user?.id, role]);

  return null;
}
