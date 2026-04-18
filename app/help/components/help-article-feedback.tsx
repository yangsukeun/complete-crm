"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 문서 만족도 — 서버 저장 없이 감사 메시지만 표시(선택 스펙) */
export function HelpArticleFeedback({ slug, className }: { slug: string; className?: string }) {
  const send = (ok: boolean) => {
    toast.success(ok ? "도움이 되었다니 다행이에요!" : "의견 감사합니다. 더 나은 문서를 준비할게요.", {
      description: `문서: ${slug}`,
    });
  };

  return (
    <div className={cn("flex flex-col items-end gap-2", className)}>
      <span className="text-muted-foreground text-xs sm:text-sm">이 문서가 도움이 됐나요?</span>
      <div className="flex gap-1">
        <Button type="button" variant="outline" size="icon" className="size-9" aria-label="도움이 됐어요" onClick={() => send(true)}>
          <ThumbsUp className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="size-9" aria-label="아니에요" onClick={() => send(false)}>
          <ThumbsDown className="size-4" />
        </Button>
      </div>
    </div>
  );
}
