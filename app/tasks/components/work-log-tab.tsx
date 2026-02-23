"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Loader2, Save, Send, Lock } from "lucide-react";
import { AIAssistToolbar } from "@/components/ai-assist-toolbar";
import { useAIAssistTarget } from "@/components/ai-assist-context";

const todayStr = () => format(new Date(), "yyyy-MM-dd");

type ActivityItem = {
  actionType: string;
  targetTitle: string;
  timestamp: string;
  ipAddress?: string | null;
};

function activityLabel(actionType: string): string {
  switch (actionType) {
    case "TASK_CREATED": return "업무 생성";
    case "TASK_COMPLETED": return "업무 완료";
    case "COMMENT_ADDED": return "댓글 작성";
    case "LOGIN": return "로그인";
    case "CHECK_IN": return "출근";
    case "CHECK_OUT": return "퇴근";
    default: return "활동";
  }
}

export function WorkLogTab() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "SUBMITTED">("DRAFT");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef(content);
  contentRef.current = content;
  const aiCtx = useAIAssistTarget();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-logs?date=${todayStr()}`);
      if (!res.ok) throw new Error("불러오기 실패");
      const data = await res.json();
      setActivities(Array.isArray(data.activities) ? data.activities : []);
      setContent(data.content ?? "");
      setStatus((data.status as "DRAFT" | "SUBMITTED") ?? "DRAFT");
    } catch {
      toast.error("업무일지를 불러올 수 없습니다.");
      setActivities([]);
      setContent("");
      setStatus("DRAFT");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/work-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayStr(), content, status: "DRAFT" }),
      });
      if (!res.ok) throw new Error("저장 실패");
      toast.success("저장되었습니다.");
    } catch {
      toast.error("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/work-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayStr(), content, status: "SUBMITTED" }),
      });
      if (!res.ok) throw new Error("제출 실패");
      setStatus("SUBMITTED");
      toast.success("제출되었습니다.");
    } catch {
      toast.error("제출에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span>업무일지 불러오는 중...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-muted-foreground text-sm">
          {format(new Date(), "yyyy년 M월 d일 (EEEE)", { locale: ko })} · 출퇴근·활동 기록은 수정할 수 없습니다.
        </p>
        <AIAssistToolbar value={content} onChange={setContent} />
      </div>

      {activities.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Lock className="size-3.5" />
            출퇴근·활동 기록 (수정 불가)
          </p>
          <ul className="font-mono text-sm">
            {activities.map((a, i) => {
              const time = format(new Date(a.timestamp), "HH:mm");
              const label = activityLabel(a.actionType);
              const ipText =
                (a.actionType === "CHECK_IN" || a.actionType === "CHECK_OUT") && a.ipAddress
                  ? ` (IP: ${a.ipAddress})`
                  : "";
              return (
                <li key={i} className="text-foreground">
                  [{time}] &apos;{a.targetTitle}&apos; {label}
                  {ipText}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <p className="text-muted-foreground mb-1.5 text-xs font-medium">추가 작성 (수정 가능)</p>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() =>
            aiCtx?.register({
              getValue: () => contentRef.current,
              onChange: setContent,
            })
          }
          onBlur={() => aiCtx?.unregister()}
          placeholder="추가 메모나 상세 내용을 입력하세요."
          className="min-h-[240px] font-mono text-sm resize-y"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving} variant="outline" size="sm">
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          저장
        </Button>
        <Button onClick={handleSubmit} disabled={saving || status === "SUBMITTED"} size="sm">
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
          제출
        </Button>
        {status === "SUBMITTED" && (
          <span className="text-muted-foreground text-sm">제출됨</span>
        )}
      </div>
    </div>
  );
}
