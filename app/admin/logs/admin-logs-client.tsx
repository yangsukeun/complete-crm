"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { formatKstHm, todayYmdKst } from "@/lib/date-kst";
import { ko } from "date-fns/locale";
import { CalendarIcon, Loader2, Lock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { readWorkLogResponse, validWorkLogDate } from "@/lib/work-log-response";

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
    case "LOGIN": return "로그인";
    case "CHECK_IN": return "출근";
    case "CHECK_OUT": return "퇴근";
    default: return "활동";
  }
}

type Employee = {
  id: string;
  name: string;
  email: string;
  department: string;
  position: string;
  role: string;
};

function AdminLogsClientInner({ employees }: { employees: Employee[] }) {
  const searchParams = useSearchParams();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState(() => todayYmdKst());
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const loadLog = useCallback(async (signal: AbortSignal) => {
    setNotice(null);
    setLoadError(null);
    setActivities([]);
    setContent("");
    setStatus("");
    if (!selectedUserId) {
      setLoading(false);
      return;
    }
    if (!validWorkLogDate(dateStr)) {
      setLoading(false);
      setLoadError('올바른 날짜를 선택해 주세요.');
      return;
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({date:dateStr,userId:selectedUserId,mode:'read-only'});
      const res = await fetch(`/api/work-logs?${query}`,{signal,cache:'no-store'});
      const result = await readWorkLogResponse(res);
      if (signal.aborted) return;
      if (result.kind==='missing') setNotice('선택한 날짜에 저장된 일지가 없습니다. 프로젝트 활동이나 다른 업무 기록이 없다는 뜻은 아닙니다.');
      else if (result.kind==='error') setLoadError(result.message);
      else {setActivities(result.activities);setContent(result.content);setStatus(result.status);}
    } catch {
      if (!signal.aborted) setLoadError('서버에 연결하지 못했습니다. 저장된 일지 유무는 확인되지 않았습니다. 다시 조회해 주세요.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [selectedUserId, dateStr]);

  useEffect(() => {
    const controller = new AbortController();
    void loadLog(controller.signal);
    return () => controller.abort();
  }, [loadLog,retry]);

  useEffect(() => {
    const uid = searchParams.get("userId");
    const d = searchParams.get("date");
    if (uid && employees.some((e) => e.id === uid)) setSelectedUserId(uid);
    if (d && validWorkLogDate(d)) setDateStr(d);
  }, [searchParams, employees]);

  const selectedEmployee = employees.find((e) => e?.id === selectedUserId);

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      {/* 좌측: 직원 목록 + 날짜 */}
      <div className="border-border flex w-full flex-col gap-4 rounded-lg border bg-card p-4 md:w-72 md:shrink-0">
        <div>
          <label className="text-muted-foreground mb-2 block text-sm font-medium">날짜</label>
          <div className="relative">
            <CalendarIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="border-input w-full rounded-md border bg-transparent py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-muted-foreground mb-2 block text-sm font-medium">직원</label>
          <ul className="max-h-[320px] space-y-0.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-1">
            {employees.map((e, idx) => (
              <li key={e?.id ?? idx}>
                <button
                  type="button"
                  onClick={() => setSelectedUserId(e?.id ?? "")}
                  className={cn(
                    "flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm transition-colors",
                    selectedUserId === e?.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted/60"
                  )}
                >
                  <span className="font-medium">{e?.name ?? ""}</span>
                  <span className={cn("text-xs", selectedUserId === e?.id ? "opacity-90" : "text-muted-foreground")}>
                    {e?.department && `${e.department} · `}
                    {(e?.position || e?.role) ?? ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 우측: 선택한 직원의 해당 날짜 업무일지 */}
      <div className="border-border flex-1 rounded-lg border bg-card p-4">
        {!selectedUserId ? (
          <div className="text-muted-foreground flex min-h-[280px] items-center justify-center gap-2">
            <User className="size-5" />
            <span>좌측에서 직원을 선택하세요.</span>
          </div>
        ) : loading ? (
          <div className="flex min-h-[280px] items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>불러오는 중...</span>
          </div>
        ) : (
          <div>
            <div className="border-border mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <h3 className="font-medium">
                {selectedEmployee?.name} · {validWorkLogDate(dateStr)?format(new Date(`${dateStr}T12:00:00+09:00`), "yyyy년 M월 d일 (EEEE)", { locale: ko }):'날짜 확인 필요'}
              </h3>
              {status && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {status === "SUBMITTED" ? "제출됨" : "작성 중"}
                </span>
              )}
            </div>
            {loadError && <div role="alert" className="mb-4 rounded-md border border-destructive p-4 text-sm">{loadError}</div>}
            {notice && <p role="status" className="mb-4 rounded-md bg-muted p-4 text-sm">{notice}</p>}
            <button type="button" className="mb-4 min-h-11 rounded-md border px-4 text-sm" onClick={()=>setRetry(value=>value+1)}>다시 조회</button>
            {activities.length > 0 && (
              <div className="border-border mb-4 rounded-lg border bg-muted/30 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Lock className="size-3.5" />
                  출퇴근·활동 기록 (수정 불가)
                </p>
                <ul className="font-mono text-sm">
                  {activities.map((a, i) => {
                    const time = formatKstHm(a.timestamp);
                    const label = activityLabel(a.actionType);
                    const ipText =
                      (a.actionType === "CHECK_IN" || a.actionType === "CHECK_OUT") && a.ipAddress
                        ? ` (IP: ${a.ipAddress})`
                        : "";
                    return (
                      <li key={i}>
                        [{time}] &apos;{a.targetTitle}&apos; {label}
                        {ipText}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {!notice&&!loadError&&<div className="rounded-md bg-muted/30 p-4">
              <p className="text-muted-foreground mb-1.5 text-xs font-medium">추가 작성</p>
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {content || "(추가 작성 내용 없음)"}
              </pre>
            </div>}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminLogsClient({ employees }: { employees: Employee[] }) {
  return (
    <Suspense fallback={null}>
      <AdminLogsClientInner employees={employees} />
    </Suspense>
  );
}
