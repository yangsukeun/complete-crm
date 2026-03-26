import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

export type FinanceRealtimeSubscription = { unsubscribe: () => void };

type Singleton = {
  userId: string;
  client: SupabaseClient;
  exp: number;
} | null;

let singleton: Singleton = null;

export function resetSharedSupabaseRealtime(): void {
  if (singleton?.client) {
    try {
      singleton.client.removeAllChannels();
    } catch {
      /* */
    }
  }
  singleton = null;
}

/**
 * Realtime 구독용 클라이언트 (NextAuth 사용자 JWT). 만료 임박 시 setAuth만 갱신해 채널 유지.
 */
export async function getSharedSupabaseRealtime(sessionUserId: string): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return null;

  const now = Math.floor(Date.now() / 1000);

  if (singleton && singleton.userId === sessionUserId && singleton.exp > now + 120) {
    return singleton.client;
  }

  const res = await fetch("/api/supabase/realtime-token", { credentials: "include" });
  if (!res.ok) return null;
  const body = (await res.json()) as { accessToken?: string; exp?: number };
  if (!body.accessToken || typeof body.exp !== "number") return null;

  if (singleton && singleton.userId === sessionUserId) {
    await singleton.client.realtime.setAuth(body.accessToken);
    singleton = { userId: sessionUserId, client: singleton.client, exp: body.exp };
    return singleton.client;
  }

  if (singleton) {
    resetSharedSupabaseRealtime();
  }

  const client = createClient(url, anon, {
    global: {
      headers: { Authorization: `Bearer ${body.accessToken}` },
    },
  });
  await client.realtime.setAuth(body.accessToken);

  singleton = { userId: sessionUserId, client, exp: body.exp };
  return client;
}

export async function subscribeChatMessagesGlobal(
  sessionUserId: string,
  onEvent: (args: { chatId: string; payload: unknown }) => void
): Promise<RealtimeChannel | null> {
  const client = await getSharedSupabaseRealtime(sessionUserId);
  if (!client) return null;

  const channel = client
    .channel(`crm-chat-global:${sessionUserId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "ChatMessage" },
      (payload) => {
        const chatId =
          (payload.new as { chatId?: string } | null)?.chatId ??
          (payload.old as { chatId?: string } | null)?.chatId;
        if (!chatId) return;
        onEvent({ chatId, payload });
      }
    )
    .subscribe();

  return channel;
}

export async function subscribeNotificationsForUser(
  sessionUserId: string,
  onEvent: (payload: unknown) => void
): Promise<RealtimeChannel | null> {
  const client = await getSharedSupabaseRealtime(sessionUserId);
  if (!client) return null;

  const channel = client
    .channel(`crm-notification:${sessionUserId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "Notification",
        filter: `userId=eq.${sessionUserId}`,
      },
      (payload) => {
        onEvent(payload);
      }
    )
    .subscribe();

  return channel;
}

/**
 * 자금관리 네비 뱃지: DB 변경 시 폴링 대신 postgres_changes.
 * TEAM_LEAD → PaymentRequest(PENDING 건수 변동), 그 외 → 본인 PaymentRequestAlert.
 */
export async function subscribeFinanceRealtime(
  sessionUserId: string,
  role: string,
  onEvent: () => void
): Promise<FinanceRealtimeSubscription | null> {
  const client = await getSharedSupabaseRealtime(sessionUserId);
  if (!client) return null;

  const channels: RealtimeChannel[] = [];

  if (role === "TEAM_LEAD") {
    const ch = client
      .channel(`crm-payment-request:${sessionUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "PaymentRequest" },
        onEvent
      )
      .subscribe();
    channels.push(ch);
  } else {
    const ch = client
      .channel(`crm-payment-request-alert:${sessionUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "PaymentRequestAlert",
          filter: `userId=eq.${sessionUserId}`,
        },
        onEvent
      )
      .subscribe();
    channels.push(ch);
  }

  return {
    unsubscribe: () => {
      for (const ch of channels) {
        try {
          void client.removeChannel(ch);
        } catch {
          /* */
        }
      }
    },
  };
}
