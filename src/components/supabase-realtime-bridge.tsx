"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { resetSharedSupabaseRealtime, subscribeChatMessagesGlobal } from "@/lib/supabase/realtime-client";

/**
 * 채팅방 목록·헤더 배지용: ChatMessage Realtime → 브라우저 전역 이벤트 (폴링 대체).
 */
export function SupabaseRealtimeBridge() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user?.id) {
      resetSharedSupabaseRealtime();
      return;
    }
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    let cancelled = false;
    let channel: { unsubscribe: () => void } | null = null;

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
    })();

    return () => {
      cancelled = true;
      try {
        channel?.unsubscribe();
      } catch {
        /* */
      }
    };
  }, [session?.user?.id]);

  return null;
}
