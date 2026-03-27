"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, addDays, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { Loader2, Save, Send, Lock, ChevronLeft, ChevronRight, CalendarSearch } from "lucide-react";
import { AIAssistToolbar } from "@/components/ai-assist-toolbar";
import { useAIAssistTarget } from "@/components/ai-assist-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const todayStr = () => format(new Date(), "yyyy-MM-dd");

type ActivityItem = {
  actionType: string;
  targetTitle: string;
  timestamp: string;
  ipAddress?: string | null;
};

function activityLabel(actionType: string): string {
  switch (actionType) {
    case "TASK_CREATED": return "프로젝트 생성";
    case "TASK_COMPLETED": return "프로젝트 완료";
    case "COMMENT_ADDED": return "댓글 작성";
    case "SCHEDULE_CREATED": return "일정 등록";
    case "LOGIN": return "로그인";
    case "CHECK_IN": return "출근";
    case "CHECK_OUT": return "퇴근";
    default: return "활동";
  }
}

export function WorkLogTab() {
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "SUBMITTED">("DRAFT");
  const [monthDeadlines, setMonthDeadlines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pastLogOpen, setPastLogOpen] = useState(false);
  const contentRef = useRef(content);
  contentRef.current = content;
  const aiCtx = useAIAssistTarget();

  const load = useCallback(async (dateStr: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/work-logs?date=${dateStr}`);
      if (!res.ok) throw new Error("불러오기 실패");
      const data = await res.json();
      setActivities(Array.isArray(data.activities) ? data.activities : []);
      setContent(data.content ?? "");
      setStatus((data.status as "DRAFT" | "SUBMITTED") ?? "DRAFT");
      setMonthDeadlines(Array.isArray(data.monthDeadlines) ? data.monthDeadlines : []);
    } catch {
      toast.error("Daily Report를 불러올 수 없습니다.");
      setActivities([]);
      setContent("");
      setStatus("DRAFT");
      setMonthDeadlines([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(selectedDate);
  }, [selectedDate, load]);

  const goPrevDay = () => setSelectedDate((d) => format(subDays(new Date(d), 1), "yyyy-MM-dd"));
  const goNextDay = () => setSelectedDate((d) => format(addDays(new Date(d), 1), "yyyy-MM-dd"));
  const goToday = () => setSelectedDate(todayStr());
  const isToday = selectedDate === todayStr();

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/work-logs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, content, status: "DRAFT" }),
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
        body: JSON.stringify({ date: selectedDate, content, status: "SUBMITTED" }),
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
        <span>Daily Report 불러오는 중...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Daily Report</h2>
        <p className="text-muted-foreground text-sm">Record your daily work</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={goPrevDay} aria-label="이전 날짜">
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e: any) => setSelectedDate(e.target.value)}
            className="h-9 w-36 font-medium"
          />
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={goNextDay} aria-label="다음 날짜">
            <ChevronRight className="size-4" />
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={goToday} className="text-muted-foreground">
              오늘
            </Button>
          )}
          <Dialog open={pastLogOpen} onOpenChange={setPastLogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-muted-foreground">
                <CalendarSearch className="mr-2 size-4" />
                지난일지 확인하기
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>지난일지로 이동</DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2 -mx-1">
                {Array.from({ length: 30 }, (_, i) => {
                  const d = format(subDays(new Date(), i + 1), "yyyy-MM-dd");
                  const label = format(subDays(new Date(), i + 1), "M/d (EEE)", { locale: ko });
                  return (
                    <Button
                      key={d}
                      variant="outline"
                      size="sm"
                      className="justify-center font-normal"
                      onClick={() => {
                        setSelectedDate(d);
                        setPastLogOpen(false);
                      }}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <AIAssistToolbar value={content} onChange={setContent} />
      </div>
      <p className="text-muted-foreground text-sm">
        {format(new Date(selectedDate + "T12:00:00"), "yyyy년 M월 d일 (EEEE)", { locale: ko })} · 출퇴근·활동 기록은 수정할 수 없습니다.
      </p>

      {monthDeadlines.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-4">
          <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">이번 달 마감·일정 (일지에서 추출)</p>
          <ul className="text-sm text-amber-900 dark:text-amber-100 space-y-1">
            {monthDeadlines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

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
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs font-medium">Daily Report · 추가 작성 (수정 가능)</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              goToday();
              requestAnimationFrame(() => {
                document.getElementById("daily-report-body")?.focus();
              });
            }}
          >
            New Daily Report
          </Button>
        </div>
        <Textarea
          id="daily-report-body"
          value={content}
          onChange={(e: any) => setContent(e.target.value)}
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
