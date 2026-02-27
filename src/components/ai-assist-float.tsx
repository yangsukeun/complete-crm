"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AIRequestToEmployeeModal } from "@/components/ai-request-to-employee-modal";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Send,
  X,
  UserPlus,
} from "lucide-react";
import { useAIAssistTarget } from "@/components/ai-assist-context";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; content: string };
type AIProvider = "gemini" | "openai" | "notebook";

const PROVIDER_LABELS: Record<AIProvider, string> = {
  gemini: "Gemini",
  openai: "GPT",
  notebook: "노트북 LLM",
};

export function AIAssistFloat() {
  const ctx = useAIAssistTarget();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [providers, setProviders] = useState<{ gemini: boolean; openai: boolean; notebook: boolean }>({
    gemini: false,
    openai: false,
    notebook: false,
  });
  const [provider, setProvider] = useState<AIProvider>("gemini");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, messages]);

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 8000);
    (async () => {
      try {
        const [provRes, profileRes] = await Promise.all([
          fetch("/api/ai/providers", { signal: ac.signal }),
          fetch("/api/profile/me", { signal: ac.signal }),
        ]);
        let profile: { preferredAiProvider?: string | null } | null = null;
        if (profileRes.ok) {
          try {
            profile = (await profileRes.json()) as { preferredAiProvider?: string | null };
          } catch {
            // ignore
          }
        }
        if (provRes.ok) {
          const p = (await provRes.json()) as { gemini?: boolean; openai?: boolean; notebook?: boolean };
          const next = {
            gemini: !!p.gemini,
            openai: !!p.openai,
            notebook: !!p.notebook,
          };
          setProviders(next);
          const available = (["gemini", "openai", "notebook"] as const).filter((k: any) => next[k]);
          const pref = profile?.preferredAiProvider;
          const chosen =
            pref === "gemini" || pref === "openai" || pref === "notebook"
              ? (available.includes(pref) ? pref : available[0])
              : available[0];
          if (chosen) setProvider(chosen);
        }
      } catch {
        // timeout or network: leave providers as-is
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      clearTimeout(timeout);
      ac.abort();
    };
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    cancelRequestedRef.current = false;

    const ac = new AbortController();
    abortControllerRef.current = ac;
    const timeoutId = setTimeout(() => ac.abort(), 90_000);

    try {
      const history = [...messages, userMsg].map((m: any) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          message: text,
          messages: history.slice(-20),
          provider,
        }),
        signal: ac.signal,
      });
      abortControllerRef.current = null;
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "AI 처리에 실패했습니다.");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      if (data.text) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.text! }]);
      }
    } catch (e) {
      abortControllerRef.current = null;
      const isAbort = e instanceof Error && e.name === "AbortError";
      if (isAbort && cancelRequestedRef.current) {
        toast.info("요청이 취소되었습니다.");
      } else if (isAbort) {
        toast.error("응답 시간이 초과되었습니다. 다시 시도해 주세요.");
      } else {
        toast.error("AI 처리에 실패했습니다.");
      }
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const cancelRequest = () => {
    if (!abortControllerRef.current) return;
    cancelRequestedRef.current = true;
    abortControllerRef.current.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const applyToTarget = (text: string) => {
    if (ctx?.target) {
      ctx.target.onChange(text);
      toast.success("선택한 칸에 적용되었습니다.");
    } else {
      toast.info("글 입력 칸을 클릭한 뒤, 적용할 메시지를 길게 눌러 '칸에 적용'을 선택하세요.");
    }
  };

  const onProviderChange = async (value: string) => {
    const v = value as AIProvider;
    setProvider(v);
    try {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredAiProvider: v }),
      });
      if (res.ok) toast.success(`${PROVIDER_LABELS[v]}으로 설정되었습니다.`);
      else toast.error("설정 저장에 실패했습니다.");
    } catch {
      toast.error("설정 저장에 실패했습니다.");
    }
  };

  const availableProviders = (["gemini", "openai", "notebook"] as const).filter((k: any) => providers[k]);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {/* 채팅 패널 — 제미나이 스타일 */}
      {open && (
        <div
          className={cn(
            "flex flex-col w-[min(420px,calc(100vw-2rem))] max-h-[70vh]",
            "rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden"
          )}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/80">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
                <Sparkles className="size-4" />
              </div>
              <span className="truncate font-semibold text-gray-900">AI 비서</span>
              {availableProviders.length > 0 && (
                <Select value={provider} onValueChange={onProviderChange}>
                  <SelectTrigger size="sm" className="h-8 w-auto min-w-0 max-w-[130px] border-gray-200">
                    <SelectValue placeholder="AI 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProviders.map((p: any) => (
                      <SelectItem key={p} value={p}>
                        {PROVIDER_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setRequestModalOpen(true)}
              >
                <UserPlus className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-full"
                onClick={() => setOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 min-h-[200px] max-h-[calc(70vh-140px)]"
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
                <Sparkles className="size-8 mb-2 text-violet-400" />
                <p>무엇이든 물어보세요.</p>
                <p className="mt-1">초안 작성, 요약, 확장, 톤 변경, 번역 등 글쓰기를 도와드립니다.</p>
                {ctx?.target && (
                  <p className="mt-2 text-xs">선택한 입력 칸에 적용하려면 답변을 길게 눌 후 &quot;칸에 적용&quot;을 선택하세요.</p>
                )}
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-violet-600 px-4 py-2.5 text-sm text-white">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="group max-w-[85%] rounded-2xl rounded-bl-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 whitespace-pre-wrap">
                    {m.content}
                    <div className="mt-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-violet-600 hover:text-violet-700"
                        onClick={() => applyToTarget(m.content)}
                      >
                        칸에 적용
                      </Button>
                    </div>
                  </div>
                </div>
              )
            )}
            {loading && (
              <div className="flex justify-start items-center gap-2">
                <div className="rounded-2xl rounded-bl-md border border-gray-200 bg-gray-50 px-4 py-2.5">
                  <Loader2 className="size-4 animate-spin text-violet-500" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-muted-foreground"
                  onClick={cancelRequest}
                >
                  취소
                </Button>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 p-3 bg-white">
            <div className="flex gap-2 items-end">
              <Textarea
                placeholder="메시지를 입력하세요..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                rows={1}
                className="min-h-[44px] max-h-32 resize-none py-3"
              />
              {loading ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-11 shrink-0 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={cancelRequest}
                >
                  취소
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  className="size-11 shrink-0 rounded-xl bg-violet-600 hover:bg-violet-700"
                  onClick={sendMessage}
                  disabled={!input.trim()}
                >
                  <Send className="size-5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <Button
        type="button"
        size="lg"
        className="h-14 rounded-full shadow-lg bg-violet-600 hover:bg-violet-700 text-white gap-2 px-5"
        onClick={() => setOpen((o) => !o)}
      >
        <Sparkles className="size-5" />
        <span className="font-medium">AI 비서</span>
      </Button>

      <AIRequestToEmployeeModal open={requestModalOpen} onOpenChange={setRequestModalOpen} />
    </div>
  );
}
