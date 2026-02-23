"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Sparkles, Loader2, ChevronDown, FileEdit, Expand, Minus, MessageSquare, Smile, Languages } from "lucide-react";

const ACTIONS = [
  { id: "auto", label: "자동 작성", icon: FileEdit, desc: "주제만 넣으면 초안 생성" },
  { id: "expand", label: "확장", icon: Expand, desc: "내용을 더 풍부하게" },
  { id: "shorten", label: "요약", icon: Minus, desc: "핵심만 짧게" },
  { id: "formal", label: "정중하게", icon: MessageSquare, desc: "합니다체로" },
  { id: "casual", label: "친근하게", icon: Smile, desc: "해요체로" },
  { id: "translate_en", label: "영어로", icon: Languages, desc: "영어 번역" },
] as const;

type ActionId = (typeof ACTIONS)[number]["id"];

export type AIAssistToolbarProps = {
  value: string;
  onChange: (value: string) => void;
  topic?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function AIAssistToolbar({
  value,
  onChange,
  topic,
  disabled,
  className = "",
}: AIAssistToolbarProps) {
  const [loading, setLoading] = useState(false);

  const run = async (action: ActionId) => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          text: value || undefined,
          topic: action === "auto" && topic ? topic : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "AI 처리에 실패했습니다.");
        return;
      }
      if (data.text) {
        onChange(data.text);
        toast.success("적용되었습니다.");
      }
    } catch {
      toast.error("AI 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || loading}
            className="gap-1.5 text-violet-600 border-violet-200 hover:bg-violet-50 hover:text-violet-700"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            AI 비서
            <ChevronDown className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            글쓰기 도움
          </DropdownMenuLabel>
          {ACTIONS.map(({ id, label, icon: Icon, desc }) => (
            <DropdownMenuItem
              key={id}
              onClick={() => run(id)}
              disabled={loading}
              className="gap-2 cursor-pointer"
            >
              <Icon className="size-4 shrink-0" />
              <div className="flex flex-col items-start">
                <span>{label}</span>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
