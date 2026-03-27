"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { todayYmdKst } from "@/lib/date-kst";
import { PageHeadline } from "@/components/page-headline";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { clearProfileMeCache, fetchProfileMeCached } from "@/lib/profile-me-client";

type ConvRow = { id: string; dateKey: string; updatedAt: string; preview: string };
type Msg = { id: string; role: string; content: string; createdAt: string };

const AI_EXEC_LABELS = { gemini: "Gemini", claude: "Claude" } as const;

export function AiSecretaryClient() {
  const { data: session } = useSession();
  const canPickAiProvider =
    session?.user?.role === "EXECUTIVE" || session?.user?.role === "ADMIN";
  const [aiKeys, setAiKeys] = useState({ gemini: false, claude: false });
  const [savedAiProvider, setSavedAiProvider] = useState<"gemini" | "claude">("gemini");
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** 날짜 빠르게 바꿀 때 이전 요청이 나중에 도착해 덮어쓰는 것 방지 */
  const messagesFetchSeq = useRef(0);

  const today = useMemo(() => todayYmdKst(), []);

  useEffect(() => {
    setSelectedDateKey((prev) => prev ?? today);
  }, [today]);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-secretary/conversations", { cache: "no-store" });
      if (!res.ok) throw new Error("list");
      const data = (await res.json()) as { conversations?: ConvRow[] };
      setConversations(data.conversations ?? []);
    } catch {
      toast.error("대화 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!canPickAiProvider) return;
    let cancelled = false;
    (async () => {
      try {
        const [kRes, pRaw] = await Promise.all([
          fetch("/api/ai/providers", { cache: "no-store" }),
          fetchProfileMeCached(false),
        ]);
        if (cancelled) return;
        if (kRes.ok) {
          const k = (await kRes.json()) as { gemini?: boolean; claude?: boolean };
          setAiKeys({ gemini: !!k.gemini, claude: !!k.claude });
        }
        if (pRaw && typeof pRaw === "object" && "preferredAiProvider" in pRaw) {
          const p = pRaw as { preferredAiProvider?: string | null };
          const pref = p.preferredAiProvider;
          if (pref === "gemini" || pref === "claude") setSavedAiProvider(pref);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canPickAiProvider]);

  const execAiChoices = useMemo(
    () => (["gemini", "claude"] as const).filter((x) => aiKeys[x]),
    [aiKeys]
  );
  const aiSelectValue =
    execAiChoices.length > 0 && execAiChoices.includes(savedAiProvider)
      ? savedAiProvider
      : execAiChoices[0] ?? "gemini";

  const onAiProviderChange = async (v: string) => {
    if (v !== "gemini" && v !== "claude") return;
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredAiProvider: v }),
      });
      if (!res.ok) throw new Error("save");
      clearProfileMeCache();
      setSavedAiProvider(v);
      toast.success(`${AI_EXEC_LABELS[v]}(으)로 저장했습니다. 다음 대화부터 적용됩니다.`);
    } catch {
      toast.error("AI 설정 저장에 실패했습니다.");
    }
  };

  const fetchMessages = useCallback(async (dateKey: string) => {
    const seq = ++messagesFetchSeq.current;
    setLoadingMsgs(true);
    setMessages([]);
    try {
      const res = await fetch(`/api/ai-secretary/conversations/${encodeURIComponent(dateKey)}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { messages?: Msg[]; conversation?: unknown };
      if (seq !== messagesFetchSeq.current) return;
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (e) {
      if (seq === messagesFetchSeq.current) {
        toast.error(e instanceof Error ? e.message : "메시지를 불러오지 못했습니다.");
        setMessages([]);
      }
    } finally {
      if (seq === messagesFetchSeq.current) setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDateKey) void fetchMessages(selectedDateKey);
  }, [selectedDateKey, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const t = newMessage.trim();
    if (!t || !selectedDateKey || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/ai-secretary/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateKey: selectedDateKey, message: t }),
      });
      const data = (await res.json()) as { error?: string; text?: string };
      if (!res.ok) throw new Error(data.error || "전송 실패");
      setNewMessage("");
      await fetchMessages(selectedDateKey);
      // 목록 전체 재조회 대신 현재 날짜 preview만 로컬 업데이트
      setConversations((prev) => {
        const preview = t.slice(0, 60);
        const exists = prev.find((c) => c.dateKey === selectedDateKey);
        if (exists) {
          return prev.map((c) =>
            c.dateKey === selectedDateKey ? { ...c, preview } : c
          );
        }
        return [
          { id: selectedDateKey, dateKey: selectedDateKey, updatedAt: new Date().toISOString(), preview },
          ...prev,
        ];
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setSending(false);
    }
  };

  const displayDates = useMemo(() => {
    const set = new Set(conversations.map((c) => c.dateKey));
    set.add(today);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [conversations, today]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start gap-2">
        <Sparkles className="mt-1 size-5 text-violet-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <PageHeadline
            title="AI 비서"
            description={`${session?.user?.name ?? "로그인"} · 역할에 맞는 프로젝트·일정 맥락으로 답변합니다.`}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:items-stretch">
        <Card className="flex w-full shrink-0 flex-col md:w-80">
          <CardContent className="max-h-[38vh] overflow-y-auto p-0 md:max-h-none">
            {loadingList ? (
              <p className="text-muted-foreground p-4 text-sm">목록 불러오는 중...</p>
            ) : (
              <ul className="divide-y">
                {displayDates.map((dk) => {
                  const conv = conversations.find((c) => c.dateKey === dk);
                  const label = dk === today ? `오늘 (${dk})` : dk;
                  const active = selectedDateKey === dk;
                  return (
                    <li key={dk}>
                      <button
                        type="button"
                        className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                          active ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedDateKey(dk)}
                      >
                        <span className="font-medium">{label}</span>
                        {conv?.preview ? (
                          <span className="text-muted-foreground truncate text-xs">{conv.preview}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {conv ? "" : "대화 없음 — 메시지를 보내면 저장됩니다"}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-[420px] min-h-0 flex-1 flex-col overflow-hidden md:min-h-[calc(100vh-12rem)]">
          {!selectedDateKey ? (
            <CardContent className="text-muted-foreground flex flex-1 items-center justify-center">
              날짜를 선택하세요.
            </CardContent>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-medium">{selectedDateKey}</span>
                  <span className="text-muted-foreground text-sm">AI 비서</span>
                </div>
                {canPickAiProvider && execAiChoices.length > 0 && (
                  <Select value={aiSelectValue} onValueChange={onAiProviderChange}>
                    <SelectTrigger size="sm" className="h-8 w-[140px] border-gray-200">
                      <SelectValue placeholder="모델" />
                    </SelectTrigger>
                    <SelectContent>
                      {execAiChoices.map((p) => (
                        <SelectItem key={p} value={p}>
                          {AI_EXEC_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
                {loadingMsgs ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">불러오는 중...</p>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1">
                    {messages.length === 0 && (
                      <p className="text-muted-foreground py-4 text-center text-sm">
                        메시지를 입력해 AI 비서와 대화를 시작하세요. (날짜별로 저장됩니다)
                      </p>
                    )}
                    {messages.map((m) => {
                      const isUser = m.role === "user";
                      return (
                        <div
                          key={m.id}
                          className={`max-w-[min(85%,680px)] rounded-lg px-3 py-2 text-sm ${
                            isUser
                              ? "ml-auto bg-primary text-primary-foreground"
                              : "mr-auto bg-muted/50"
                          }`}
                        >
                          {isUser ? (
                            <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          ) : (
                            <MarkdownRenderer content={m.content} />
                          )}
                          <span
                            className={`mt-1 block text-[10px] ${isUser ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                          >
                            {formatKst(m.createdAt)}
                          </span>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} aria-hidden />
                  </div>
                )}
                <div className="flex flex-wrap items-end gap-2 border-t pt-2">
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder="메시지 입력... (Enter 전송, Shift+Enter 줄바꿈)"
                    rows={2}
                    className="min-h-10 max-h-32 min-w-0 flex-1 resize-none"
                  />
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => void handleSend()}
                    disabled={sending || !newMessage.trim()}
                    aria-label="전송"
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function formatKst(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
