"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  resetSharedSupabaseRealtime,
  subscribeChatMessagesGlobal,
  subscribeFinanceRealtime,
  subscribeGlobalPresence,
} from "@/lib/supabase/realtime-client";

/**
 * 채팅방 목록·채팅 화면: ChatMessage Realtime → 전역 이벤트.
 * `/chat` 이 아닐 때는 구독하지 않아 게시판 등에서 `/api/chats`·메시지 폴링 연쇄 호출을 막음.
 */
export function SupabaseRealtimeBridge() {
  const pathname = usePathname() ?? "";
  const isChatRoute = pathname.startsWith("/chat");
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
      if (isChatRoute) {
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
      }

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
        channel?.unsubscribe();
      } catch {
        /* */
      }
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
  }, [session?.user?.id, role, isChatRoute]);

  return null;
}
