"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { X, Maximize2, Minus, Send, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { formatUserName } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { ImageLightbox } from "@/components/chat/image-lightbox";

type FCMessage = {
  id: string;
  body: string;
  createdAt: string;
  isDeleted?: boolean;
  user: { id: string; name: string; position?: string | null };
};

type FCChat = {
  id: string;
  isGroup: boolean;
  name: string | null;
  participants: { id: string; name: string }[];
};

function formatTime(iso: string) {
  try {
    return format(new Date(iso), "HH:mm", { locale: ko });
  } catch {
    return "";
  }
}

function apiUrl(path: string) {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).href;
}

export function FloatingChatPanel() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const [chatId, setChatId] = useState<string | null>(null);
  const [chatInfo, setChatInfo] = useState<FCChat | null>(null);
  const [messages, setMessages] = useState<FCMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatIdRef = useRef<string | null>(null);
  const inboxRefreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  // /chat 페이지 이동 시 플로팅 창 자동 닫기 (채팅 페이지와 중복 방지)
  useEffect(() => {
    if (pathname?.startsWith("/chat")) setChatId(null);
  }, [pathname]);

  // 플로팅 채팅 열기 이벤트 수신
  useEffect(() => {
    const onOpen = (ev: Event) => {
      const id = (ev as CustomEvent<{ chatId: string }>).detail?.chatId;
      if (!id) return;
      setChatId(id);
      setMinimized(false);
      setMessages([]);
      setInput("");
    };
    window.addEventListener("open-floating-chat", onOpen);
    return () => window.removeEventListener("open-floating-chat", onOpen);
  }, []);

  // 메시지 목록 + 채팅 정보 조회
  const fetchData = useCallback(async (id: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [msgRes, chatRes] = await Promise.all([
        fetch(apiUrl(`/api/chats/${id}/messages?limit=50&markRead=1`), { credentials: "include" }),
        fetch(apiUrl(`/api/chats/${id}`), { credentials: "include" }),
      ]);
      if (msgRes.ok) {
        const raw = await msgRes.json();
        const list: FCMessage[] = Array.isArray(raw) ? raw : (raw.messages ?? []);
        setMessages(list);
        // 읽음 처리(markRead=1) 후: 상단 뱃지/알림 카운트 즉시 갱신
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("chat-read"));
          window.dispatchEvent(new Event("notification-realtime"));
        }
      }
      if (chatRes.ok) {
        const info: FCChat = await chatRes.json();
        setChatInfo(info);
      }
    } catch {
      /* ignore */
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  useEffect(() => {
    if (!chatId) return;
    void fetchDataRef.current(chatId);
  }, [chatId]);

  /** ChatMessage Realtime 은 `ChatPageClient` 마운트 시에만 — 플로팅만 열린 상태에서는 주기 갱신 */
  useEffect(() => {
    if (!chatId || pathname.startsWith("/chat")) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void fetchDataRef.current(chatId, true);
    };
    const id = window.setInterval(tick, 12_000);
    return () => clearInterval(id);
  }, [chatId, pathname]);

  useEffect(() => {
    return () => {
      if (inboxRefreshDebounceRef.current) clearTimeout(inboxRefreshDebounceRef.current);
    };
  }, []);

  // 새 메시지 수신 시 갱신
  useEffect(() => {
    const onRefresh = () => {
      const cid = chatIdRef.current;
      if (!cid || minimized) return;
      if (inboxRefreshDebounceRef.current) clearTimeout(inboxRefreshDebounceRef.current);
      inboxRefreshDebounceRef.current = setTimeout(() => {
        inboxRefreshDebounceRef.current = null;
        void fetchDataRef.current(cid, true);
      }, 1200);
    };
    const onRealtime = (ev: Event) => {
      const ce = ev as CustomEvent<{
        chatId: string;
        payload: { eventType?: string; new?: Record<string, unknown> };
      }>;
      if (ce.detail?.chatId !== chatIdRef.current) return;
      const p = ce.detail?.payload;
      if (p?.eventType === "INSERT" && p.new) {
        const row = p.new as { id: string; body: string; userId: string; createdAt: string };
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          return [
            ...prev,
            {
              id: row.id,
              body: row.body,
              createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date(row.createdAt).toISOString(),
              user: { id: row.userId, name: "..." },
            },
          ];
        });
      }
    };
    window.addEventListener("chat-inbox-refresh", onRefresh);
    window.addEventListener("chat-realtime", onRealtime as EventListener);
    return () => {
      window.removeEventListener("chat-inbox-refresh", onRefresh);
      window.removeEventListener("chat-realtime", onRealtime as EventListener);
    };
  }, [minimized]);

  // 메시지 추가될 때 하단 스크롤
  useEffect(() => {
    if (!minimized && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, minimized]);

  const handleSend = useCallback(async () => {
    if (!chatId || !input.trim() || sending) return;
    const body = input.trim();
    setInput("");
    setSending(true);
    try {
      const res = await fetch(apiUrl(`/api/chats/${chatId}/messages`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    } catch {
      /* ignore */
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [chatId, input, sending]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  const handleExpand = useCallback(() => {
    if (chatId) {
      router.push(`/chat/${chatId}`);
      setChatId(null);
    }
  }, [chatId, router]);

  if (!chatId || !session?.user) return null;

  const myId = session.user.id;

  const chatTitle = chatInfo
    ? chatInfo.isGroup && chatInfo.name
      ? chatInfo.name
      : chatInfo.participants
          .filter((p) => p.id !== myId)
          .map((p) => formatUserName(p))
          .join(", ") || "채팅"
    : "채팅";

  return (
    <>
      <div
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-[200] flex flex-col"
        style={{ width: 360 }}
      >
      <div className="flex flex-col rounded-xl border bg-background shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b bg-primary/5 px-3 py-2 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MessageCircle className="size-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold">{chatTitle}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="전체 채팅으로 이동"
              onClick={handleExpand}
            >
              <Maximize2 className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title={minimized ? "열기" : "최소화"}
              onClick={() => setMinimized((v) => !v)}
            >
              <Minus className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="닫기"
              onClick={() => setChatId(null)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* 메시지 목록 */}
            <div className="flex flex-col gap-2 overflow-y-auto p-3" style={{ height: 340 }}>
              {loading ? (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  불러오는 중…
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  메시지가 없습니다.
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = m.user.id === myId;
                  const bubbleBody = m.isDeleted ? (
                    <p className="italic text-xs text-muted-foreground">🚫 삭제된 메시지</p>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {m.body
                        .split(/(!\[[^\]]*\]\([^)]+\)|https?:\/\/[^\s]+)/g)
                        .filter(Boolean)
                        .map((part, i) => {
                          const imgMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
                          if (imgMatch) {
                            const src = imgMatch[2];
                            return (
                              <span key={i} className="relative mt-1 block max-h-40 max-w-full">
                                <Image
                                  src={src}
                                  alt={imgMatch[1] || "이미지"}
                                  width={300}
                                  height={160}
                                  unoptimized
                                  className="max-h-40 max-w-full rounded object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => setLightboxSrc(src)}
                                />
                              </span>
                            );
                          }
                          if (part.match(/^https?:\/\//)) {
                            return (
                              <Link
                                key={i}
                                href={part}
                                rel="noopener noreferrer"
                                className="text-primary underline"
                              >
                                {part}
                              </Link>
                            );
                          }
                          return part;
                        })}
                    </p>
                  );
                  return (
                    <div
                      key={m.id}
                      className={`flex w-full ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`flex max-w-[85%] flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
                        {!isMine && (
                          <span className="px-0.5 text-[11px] font-medium text-muted-foreground">
                            {formatUserName(m.user)}
                          </span>
                        )}
                        <div
                          className={`rounded-2xl border px-2.5 py-1.5 text-sm shadow-sm ${
                            isMine
                              ? "rounded-tr-sm border-amber-300 bg-amber-100 dark:border-amber-800 dark:bg-amber-950/55"
                              : "rounded-tl-sm border-sky-300 bg-sky-100 dark:border-sky-800 dark:bg-sky-950/55"
                          }`}
                        >
                          {bubbleBody}
                          <div className="mt-0.5 text-[10px] text-muted-foreground text-right">
                            {formatTime(m.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} aria-hidden />
            </div>

            {/* 입력창 */}
            <div className="flex items-end gap-2 border-t p-2">
              <Textarea
                ref={inputRef}
                placeholder="메시지 입력… (Enter 전송)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                className="min-h-9 max-h-24 resize-none py-2 text-sm"
              />
              <Button
                size="icon"
                className="size-9 shrink-0"
                onClick={handleSend}
                disabled={!input.trim() || sending}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </>
        )}
      </div>
      </div>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
}
