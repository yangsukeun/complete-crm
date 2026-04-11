import {
  createClient,
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
  type SupabaseClient,
} from "@supabase/supabase-js";

function browserAppIsLocalhost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

function supabaseUrlLooksLocalhost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

/**
 * 프로덕션 배포에 .env 로컬 Supabase URL이 남으면 브라우저가 127.0.0.1 로 접속 시도 → 연결 거부·네트워크 오류 폭주.
 */
function shouldSkipBrowserRealtime(url: string): boolean {
  if (typeof window === "undefined") return false;
  return supabaseUrlLooksLocalhost(url) && !browserAppIsLocalhost();
}

export type FinanceRealtimeSubscription = { unsubscribe: () => void };

// [PERF-B] Realtime 채널 해제 시 removeChannel로 정리 (누수 방지)
export type RealtimeSubscriptionHandle = { unsubscribe: () => void };

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
  if (shouldSkipBrowserRealtime(url)) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        "[Supabase realtime] NEXT_PUBLIC_SUPABASE_URL 이 localhost 를 가리킵니다. 배포 도메인에서는 Realtime 을 건너뜁니다. Vercel 환경변수를 프로젝트 Supabase URL 로 맞추세요."
      );
    }
    return null;
  }

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
): Promise<RealtimeSubscriptionHandle | null> {
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
        // chatId가 비어오는 경우에도 최소한 inbox refresh 트리거를 위해 콜백은 호출한다.
        onEvent({ chatId: chatId ?? "", payload });
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      try {
        void client.removeChannel(channel);
      } catch {
        /* */
      }
    },
  };
}

function chatMessageRow(payload: {
  new?: unknown;
  old?: unknown;
}): Record<string, unknown> | null {
  const n = payload.new as Record<string, unknown> | null | undefined;
  if (n && typeof n === "object") return n;
  const o = payload.old as Record<string, unknown> | null | undefined;
  if (o && typeof o === "object") return o;
  return null;
}

/** 채팅방 구독 — Supabase Realtime filter(camleCase chatId) 이슈를 우회해 filter 없이 수신 후 클라이언트에서 필터링 */
export async function subscribeChatMessagesForChatRoom(
  userId: string,
  chatId: string,
  onEvent: (args: { payload: RealtimePostgresChangesPayload<Record<string, unknown>> }) => void
): Promise<RealtimeSubscriptionHandle> {
  // 공유 클라이언트 사용 (JWT 인증 유지)
  const client = await getSharedSupabaseRealtime(userId);
  if (!client) return { unsubscribe: () => {} };

  const channelName = `room-${chatId}-${userId}-${Date.now()}`;

  const channel = client
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ChatMessage",
      },
      (payload) => {
        const row = chatMessageRow(payload);
        const rowChatId = (row?.chatId as string | undefined) ?? undefined;
        /**
         * 일부 환경에서 payload.new/old 에 chatId 가 비어올 수 있음(REPLICA IDENTITY/RLS 등).
         * 이 경우 방 필터링이 불가능하므로 이벤트는 통과시키고, ChatPageClient 쪽에서 fetch 폴백 처리.
         */
        if (rowChatId && String(rowChatId) !== String(chatId)) return;
        onEvent({
          payload: payload as RealtimePostgresChangesPayload<Record<string, unknown>>,
        });
      }
    )
    .subscribe((status, err) => {
      if (err) {
        console.error("[RT] 채팅방 구독 오류:", err);
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[RT] 채팅방 구독 상태:", chatId, status);
      }
    });

  return {
    unsubscribe: () => {
      try {
        void client.removeChannel(channel);
      } catch {
        /* */
      }
    },
  };
}

export async function subscribeNotificationsForUser(
  sessionUserId: string,
  onEvent: (payload: unknown) => void
): Promise<RealtimeSubscriptionHandle | null> {
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

  return {
    unsubscribe: () => {
      try {
        void client.removeChannel(channel);
      } catch {
        /* */
      }
    },
  };
}

/**
 * 글로벌 Presence 채널 — 앱에 접속한 사용자 목록을 실시간으로 추적.
 * onSync: 현재 온라인 userId 배열을 콜백으로 전달.
 */
export async function subscribeGlobalPresence(
  sessionUserId: string,
  userName: string,
  onSync: (onlineUserIds: string[]) => void
): Promise<RealtimeSubscriptionHandle | null> {
  const client = await getSharedSupabaseRealtime(sessionUserId);
  if (!client) return null;

  const channel = client.channel("crm-presence-global", {
    config: { presence: { key: sessionUserId } },
  });

  const emitSync = () => {
    const state = channel.presenceState<{ userId: string }>();
    const ids = Object.values(state)
      .flatMap((arr) => arr.map((p: { userId: string }) => p.userId))
      .filter(Boolean);
    onSync([...new Set(ids)]);
  };

  channel
    .on("presence", { event: "sync" }, emitSync)
    .on("presence", { event: "join" }, emitSync)
    .on("presence", { event: "leave" }, emitSync)
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ userId: sessionUserId, name: userName });
        // track() 직후 presenceState가 아직 비어 있을 수 있으므로 짧은 딜레이 후 한 번 더 emit
        setTimeout(emitSync, 800);
        setTimeout(emitSync, 2500);
      }
    });

  return {
    unsubscribe: () => {
      try {
        void client.removeChannel(channel);
      } catch {
        /* */
      }
    },
  };
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
