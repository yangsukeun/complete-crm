"use client";

import { useEffect, useState, useCallback } from "react";
import useSWR from "swr";
import Link from "next/link";
import { jsonFetcher } from "@/lib/api-swr";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "lucide-react";
import { leaveDisplayDays } from "@/lib/leave-request-serialize";
import { toKstYmd } from "@/lib/date-kst";

const OFFICE_START_HOUR = 9;
const OFFICE_START_MINUTE = 0;

type AttendanceRecord = {
  id: string;
  userId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  user?: { id: string; name: string | null; email: string };
};

type LeaveApiBalance = {
  year: number;
  total: number;
  annualTotal: number;
  carryOver: number;
  used: number;
  manualDeduction: number;
  remaining: number;
};

type LeaveRequestRow = {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  type: string;
  reason: string | null;
  status: string;
  createdAt?: string;
};

type LeaveBundle = {
  balance: LeaveApiBalance;
  requests: LeaveRequestRow[];
  /** 프로필 API의 입사일 (YYYY-MM-DD) */
  joinDate: string | null;
};

function leaveTypeLabel(t: string): string {
  const m: Record<string, string> = {
    ANNUAL: "연차",
    HALF_AM: "반차(오전)",
    HALF_PM: "반차(오후)",
    QUARTER_AM: "반반차(오전)",
    QUARTER_PM: "반반차(오후)",
    SICK_PAID: "병가(유급)",
    SICK_UNPAID: "병가(무급)",
  };
  return m[t] ?? t;
}

function leaveStatusLabel(s: string): string {
  if (s === "APPROVED") return "승인";
  if (s === "REJECTED") return "반려";
  if (s === "PENDING") return "대기";
  if (s === "TEAM_LEAD_APPROVED") return "팀장승인";
  if (s === "CANCEL_REQUESTED") return "취소요청";
  if (s === "CANCELLED") return "취소";
  return s;
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

function formatDateOnly(iso: string): string {
  const ymd = toKstYmd(iso);
  if (!ymd) return "—";
  return new Date(`${ymd}T12:00:00+09:00`).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

function isLate(startTime: string | null): boolean {
  if (!startTime) return false;
  const d = new Date(startTime);
  return d.getHours() > OFFICE_START_HOUR || (d.getHours() === OFFICE_START_HOUR && d.getMinutes() > OFFICE_START_MINUTE);
}

function diffMinutes(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 60000);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}시간 ${m}분`;
}

function formatLeaves(n: number): string {
  const fixed = n.toFixed(2);
  if (fixed.endsWith("00")) return n.toFixed(1);
  return fixed;
}

const LEAVE_TYPE_OPTIONS: { value: string; days: number; label: string }[] = [
  { value: "FULL", days: 1, label: "연차 (1일 차감)" },
  { value: "HALF", days: 0.5, label: "반차 (0.5일 차감)" },
  { value: "QUARTER", days: 0.25, label: "반반차 (0.25일 차감)" },
];

export default function HrPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [monthRecords, setMonthRecords] = useState<AttendanceRecord[]>([]);
  const [todayAll, setTodayAll] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  /** SSR 시각 ≠ 클라이언트 시각이면 시계 텍스트 하이드레이션 불일치 → 마운트 후에만 갱신 */
  const [now, setNow] = useState<Date | null>(null);

  const roleUpper = String((session?.user as { role?: string } | undefined)?.role ?? "").toUpperCase();
  const isAdmin = roleUpper === "EXECUTIVE" || roleUpper === "ADMIN";

  const loadToday = async () => {
    const res = await fetch("/api/attendance?scope=today");
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) {
      setTodayRecord(null);
      return;
    }
    if (data.length > 0 && data[0].user) return;
    setTodayRecord(data.length > 0 ? data[0] : null);
  };

  const loadMonth = async () => {
    const res = await fetch("/api/attendance?scope=month&mine=1");
    if (!res.ok) return;
    const data = await res.json();
    setMonthRecords(Array.isArray(data) ? data : []);
  };

  const { data: todayAllSwr, mutate: mutateTodayAll } = useSWR<AttendanceRecord[]>(
    sessionStatus === "authenticated" && isAdmin ? "/api/attendance?scope=today" : null,
    jsonFetcher,
    { dedupingInterval: 90_000, revalidateOnFocus: true }
  );

  useEffect(() => {
    if (!isAdmin) {
      setTodayAll([]);
      return;
    }
    if (Array.isArray(todayAllSwr)) setTodayAll(todayAllSwr);
  }, [isAdmin, todayAllSwr]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    (async () => {
      setLoading(true);
      await loadToday();
      await loadMonth();
      if (isAdmin) await mutateTodayAll();
      setLoading(false);
    })();
  }, [sessionStatus, isAdmin, mutateTodayAll]);

  useEffect(() => {
    if (!isAdmin || !session?.user?.id || todayAll.length === 0) return;
    const my = todayAll.find((r: any) => r.userId === session.user?.id);
    setTodayRecord(my ?? null);
  }, [isAdmin, session?.user?.id, todayAll]);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handlePunch = async () => {
    if (punching) return;
    setPunching(true);
    try {
      const res = await fetch("/api/attendance", { method: "POST" });
      const text = await res.text();
      let data: { record?: AttendanceRecord; error?: string } = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: "응답을 처리할 수 없습니다." };
        }
      }
      if (!res.ok) {
        alert(data?.error ?? `오류 (${res.status})`);
        setPunching(false);
        return;
      }
      if (data.record) setTodayRecord(data.record);
      await loadMonth();
      if (isAdmin) await mutateTodayAll();
    } catch (err) {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setPunching(false);
    }
  };

  const isWorking = todayRecord?.status === "working";
  const canPunchOut = isWorking;
  const canPunchIn = !todayRecord;

  const workMinutes =
    todayRecord?.startTime && isWorking && now
      ? diffMinutes(new Date(todayRecord.startTime), now)
      : todayRecord?.startTime && todayRecord?.endTime
        ? diffMinutes(new Date(todayRecord.startTime), new Date(todayRecord.endTime))
        : 0;

  // ---- 연차 탭 state ----
  const [leaveData, setLeaveData] = useState<LeaveBundle | null>(null);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveType, setLeaveType] = useState<"FULL" | "HALF" | "QUARTER">("FULL");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [myHireDateEditing, setMyHireDateEditing] = useState(false);
  const [myHireDateInput, setMyHireDateInput] = useState("");
  const [myHireDateSaving, setMyHireDateSaving] = useState(false);

  const loadLeave = useCallback(async () => {
    setLeaveLoading(true);
    try {
      const [leaveRes, profRes] = await Promise.all([fetch("/api/leave"), fetch("/api/profile/me")]);
      if (!leaveRes.ok) {
        setLeaveData(null);
        return;
      }
      const leaveJson = (await leaveRes.json()) as {
        balance?: LeaveApiBalance;
        requests?: LeaveRequestRow[];
      };
      const profJson = profRes.ok ? ((await profRes.json()) as { joinDate?: string }) : {};
      if (!leaveJson.balance) {
        setLeaveData(null);
        return;
      }
      setLeaveData({
        balance: leaveJson.balance,
        requests: Array.isArray(leaveJson.requests) ? leaveJson.requests : [],
        joinDate: typeof profJson.joinDate === "string" ? profJson.joinDate.slice(0, 10) : null,
      });
    } finally {
      setLeaveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    loadLeave();
  }, [sessionStatus, loadLeave]);

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = leaveStart.trim();
    const end = leaveType === "FULL" ? leaveEnd.trim() || start : start;
    if (!start) {
      alert("날짜를 선택해 주세요.");
      return;
    }
    if (leaveSubmitting) return;
    setLeaveSubmitting(true);
    try {
      const apiType =
        leaveType === "FULL" ? "ANNUAL" : leaveType === "HALF" ? "HALF_AM" : "QUARTER_AM";
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          reason: leaveReason.trim() || undefined,
          type: apiType,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json?.error ?? "연차 신청에 실패했습니다.");
        return;
      }
      setLeaveStart("");
      setLeaveEnd("");
      setLeaveReason("");
      await loadLeave();
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleSaveMyHireDate = async () => {
    const value = myHireDateInput.trim();
    setMyHireDateSaving(true);
    try {
      const res = await fetch("/api/users/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hireDate: value || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data?.error === "string" ? data.error : "저장에 실패했습니다.");
        return;
      }
      setMyHireDateEditing(false);
      await loadLeave();
    } finally {
      setMyHireDateSaving(false);
    }
  };

  if (sessionStatus === "loading" || sessionStatus === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center text-slate-400">
        로그인이 필요합니다.
      </div>
    );
  }

  const myDisplayInfo = leaveData
    ? {
        hireDate: leaveData.joinDate,
        totalLeaves: leaveData.balance.total,
        usedLeaves: leaveData.balance.used,
        remainingLeaves: leaveData.balance.remaining,
      }
    : null;

  const myLeaveRequests =
    leaveData && session?.user?.id
      ? leaveData.requests.filter((r) => r.userId === session.user.id)
      : [];

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-slate-100">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">인사관리 (HR)</h1>
          <p className="text-slate-500 text-sm">출퇴근 기록과 연차·반차 신청·승인을 한 화면에서 처리합니다.</p>
        </div>

        <Tabs defaultValue="attendance" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="attendance">🕒 출퇴근</TabsTrigger>
            <TabsTrigger value="leave">🏖️ 연차 관리</TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="space-y-6">
            <section className="rounded-2xl border border-slate-600/50 bg-slate-900/80 p-6 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
              <h2 className="text-lg font-semibold text-cyan-200 mb-4">내 근태</h2>
              {loading ? (
                <p className="text-slate-400">불러오는 중...</p>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-slate-400 text-sm">현재 시각</p>
                    <p className="text-xl font-mono text-slate-100">
                      {now ? now.toLocaleTimeString("ko-KR", { hour12: false }) : "—"}
                    </p>
                    <p className="text-slate-400 text-sm mt-2">오늘 근무 시간</p>
                    <p className="text-lg font-mono text-cyan-300">
                      {formatDuration(workMinutes)}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {canPunchIn && (
                      <Button
                        size="lg"
                        className="min-w-[180px] h-14 text-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                        onClick={handlePunch}
                        disabled={punching}
                      >
                        {punching ? "처리 중..." : "출근하기"}
                      </Button>
                    )}
                    {canPunchOut && (
                      <Button
                        size="lg"
                        className="min-w-[180px] h-14 text-lg bg-rose-600 hover:bg-rose-500 text-white"
                        onClick={handlePunch}
                        disabled={punching}
                      >
                        {punching ? "처리 중..." : "퇴근하기"}
                      </Button>
                    )}
                    {todayRecord?.status === "done" && (
                      <p className="text-slate-400 py-2">오늘 퇴근 완료</p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {isAdmin && (
              <section className="rounded-2xl border border-slate-600/50 bg-slate-900/80 p-6 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
                <h2 className="text-lg font-semibold text-cyan-200 mb-4">전 직원 오늘 출근 현황</h2>
                <div className="overflow-x-auto rounded-lg border border-slate-600/50">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-slate-600 bg-slate-800/80 text-slate-300">
                        <th className="px-4 py-3">이름</th>
                        <th className="px-4 py-3">이메일</th>
                        <th className="px-4 py-3">출근 시각</th>
                        <th className="px-4 py-3">퇴근 시각</th>
                        <th className="px-4 py-3">상태</th>
                        <th className="px-4 py-3">지각</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayAll.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                            오늘 출근 기록이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        todayAll.map((r: any) => (
                          <tr key={r.id} className="border-b border-slate-700/50 hover:bg-slate-800/50">
                            <td className="px-4 py-3 text-slate-200">{r.user?.name ?? "-"}</td>
                            <td className="px-4 py-3 text-slate-400">{r.user?.email ?? "-"}</td>
                            <td className="px-4 py-3 font-mono">{formatTime(r.startTime)}</td>
                            <td className="px-4 py-3 font-mono">{formatTime(r.endTime)}</td>
                            <td className="px-4 py-3">
                              <span
                                className={r.status === "working" ? "text-emerald-400" : "text-slate-400"}
                              >
                                {r.status === "working" ? "근무중" : "퇴근완료"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {isLate(r.startTime) ? (
                                <span className="text-amber-400 font-medium">지각</span>
                              ) : (
                                <span className="text-slate-500">정상</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-slate-600/50 bg-slate-900/80 p-6 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
              <h2 className="text-lg font-semibold text-cyan-200 mb-4">이번 달 출퇴근 기록</h2>
              <div className="space-y-2">
                {monthRecords.length === 0 ? (
                  <p className="text-slate-500 py-4">기록이 없습니다.</p>
                ) : (
                  monthRecords.map((r: any) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-700/50 bg-slate-800/30 px-4 py-3"
                    >
                      <span className="text-slate-300 font-medium w-24">{formatDate(r.date)}</span>
                      <span className="font-mono text-slate-200">{formatTime(r.startTime)}</span>
                      <span className="text-slate-500">→</span>
                      <span className="font-mono text-slate-200">{formatTime(r.endTime)}</span>
                      <span
                        className={
                          r.status === "working"
                            ? "text-emerald-400 text-sm"
                            : "text-slate-400 text-sm"
                        }
                      >
                        {r.status === "working" ? "근무중" : "퇴근완료"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="leave" className="space-y-6">
            {leaveLoading ? (
              <p className="text-slate-400">연차 정보를 불러오는 중...</p>
            ) : (
              <>
                {/* 내 정보 & 연차 현황 카드 (최상단) */}
                <section className="rounded-2xl border border-slate-600/50 bg-slate-900/80 p-6 shadow-[0_0_20px_rgba(34,211,238,0.08)]">
                  <h2 className="text-lg font-semibold text-cyan-200 mb-4">내 정보 & 연차 현황</h2>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
                    <div className="space-y-2">
                      <p className="text-slate-400 text-sm">이름</p>
                      <p className="text-slate-100 font-medium">{session?.user?.name ?? "-"}</p>
                      <p className="text-slate-400 text-sm mt-2">이메일</p>
                      <p className="text-slate-200">{session?.user?.email ?? "-"}</p>
                      <p className="text-slate-400 text-sm mt-2">입사일 (Hire Date)</p>
                      {myHireDateEditing ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            type="date"
                            value={myHireDateInput}
                            onChange={(e: any) => setMyHireDateInput(e.target.value)}
                            className="h-9 w-44 bg-slate-800 border-slate-600 text-slate-100"
                          />
                          <Button
                            size="sm"
                            className="bg-cyan-600 hover:bg-cyan-500"
                            onClick={handleSaveMyHireDate}
                            disabled={myHireDateSaving}
                          >
                            {myHireDateSaving ? "저장 중..." : "저장"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-600 text-slate-400"
                            onClick={() => {
                              setMyHireDateEditing(false);
                              setMyHireDateInput(myDisplayInfo?.hireDate?.slice(0, 10) ?? "");
                            }}
                          >
                            취소
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-slate-200">
                            {myDisplayInfo?.hireDate
                              ? formatDateOnly(myDisplayInfo.hireDate)
                              : "미설정"}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 border-slate-600 text-slate-300 hover:bg-slate-700"
                            onClick={() => {
                              setMyHireDateEditing(true);
                              setMyHireDateInput(
                                myDisplayInfo?.hireDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
                              );
                            }}
                          >
                            <Calendar className="w-4 h-4" />
                            입사일 수정
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="sm:border-l sm:border-slate-600/50 sm:pl-6 sm:min-w-[280px]">
                      {myDisplayInfo ? (
                        <>
                          {!myDisplayInfo.hireDate && (
                            <p className="text-amber-400/90 text-sm mb-2">
                              입사일이 비어 있으면 근로기준법 간이 부여가 부정확할 수 있습니다. 아래에서 설정해 주세요.
                            </p>
                          )}
                          <p className="text-slate-400 text-sm mb-3">연차 대시보드 ({leaveData?.balance.year}년)</p>
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                              <p className="text-slate-500 text-xs">총 사용가능</p>
                              <p className="text-2xl font-bold text-slate-200">
                                {formatLeaves(myDisplayInfo.totalLeaves)}
                              </p>
                              <p className="text-slate-400 text-xs">일</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs">사용(승인 반영)</p>
                              <p className="text-2xl font-bold text-amber-300">
                                {formatLeaves(myDisplayInfo.usedLeaves)}
                              </p>
                              <p className="text-slate-400 text-xs">일</p>
                            </div>
                            <div>
                              <p className="text-slate-500 text-xs">잔여</p>
                              <p className="text-2xl font-bold text-emerald-400">
                                {formatLeaves(myDisplayInfo.remainingLeaves)}
                              </p>
                              <p className="text-slate-400 text-xs">일</p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-slate-500 text-sm py-2">연차 정보를 불러오지 못했습니다.</p>
                      )}
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-600/50 bg-slate-900/80 p-6">
                  <h2 className="text-lg font-semibold text-amber-200 mb-4">연차 신청</h2>
                  <form onSubmit={handleLeaveSubmit} className="space-y-4">
                    <div>
                      <p className="text-slate-400 text-sm mb-2">종류 선택</p>
                      <div className="flex flex-wrap gap-4">
                        {LEAVE_TYPE_OPTIONS.map((opt: any) => (
                          <label
                            key={opt.value}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name="leaveType"
                              value={opt.value}
                              checked={leaveType === opt.value}
                              onChange={() => setLeaveType(opt.value as "FULL" | "HALF" | "QUARTER")}
                              className="rounded-full border-slate-500 text-amber-500 focus:ring-amber-500"
                            />
                            <span className="text-slate-200">
                              {opt.value === "FULL" && "🟢"}
                              {opt.value === "HALF" && "🟡"}
                              {opt.value === "QUARTER" && "🟣"}
                              {" "}{opt.label}
                            </span>
                          </label>
                        ))}
                      </div>
                      {(leaveType === "HALF" || leaveType === "QUARTER") && (
                        <p className="text-slate-500 text-xs mt-1">
                          {leaveType === "HALF" && "오전/오후는 사유(메모)에 적어 주세요."}
                          {leaveType === "QUARTER" && "2시간 외출 등은 사유에 적어 주세요."}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-400 text-sm mb-1">시작일</label>
                        <Input
                          type="date"
                          value={leaveStart}
                          onChange={(e: any) => setLeaveStart(e.target.value)}
                          className="bg-slate-800 border-slate-600 text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-sm mb-1">
                          종료일 (연차만 해당, 반차/반반차는 비워두면 시작일과 동일)
                        </label>
                        <Input
                          type="date"
                          value={leaveEnd}
                          onChange={(e: any) => setLeaveEnd(e.target.value)}
                          className="bg-slate-800 border-slate-600 text-slate-100"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-400 text-sm mb-1">사유 (메모)</label>
                      <Input
                        value={leaveReason}
                        onChange={(e: any) => setLeaveReason(e.target.value)}
                        placeholder="오전 반차, 개인용무 등"
                        className="bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={leaveSubmitting}
                      className="bg-amber-600 hover:bg-amber-500 text-white"
                    >
                      {leaveSubmitting ? "신청 중..." : "연차 신청"}
                    </Button>
                  </form>
                </section>

                {leaveData && (
                  <section className="rounded-2xl border border-slate-600/50 bg-slate-900/80 p-6">
                    <h2 className="text-lg font-semibold text-amber-200 mb-4">내 연차 사용 내역</h2>
                    <div className="overflow-x-auto rounded-lg border border-slate-600/50">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-slate-600 bg-slate-800/80 text-slate-300">
                            <th className="px-4 py-3">기간</th>
                            <th className="px-4 py-3">종류</th>
                            <th className="px-4 py-3">일수</th>
                            <th className="px-4 py-3">사유</th>
                            <th className="px-4 py-3">상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myLeaveRequests.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                                신청 내역이 없습니다.
                              </td>
                            </tr>
                          ) : (
                            myLeaveRequests.map((r) => {
                              const days = leaveDisplayDays(r.type, new Date(r.startDate), new Date(r.endDate));
                              return (
                                <tr key={r.id} className="border-b border-slate-700/50">
                                  <td className="px-4 py-3 text-slate-200">
                                    {formatDateOnly(r.startDate)}
                                    {toKstYmd(r.startDate) !== toKstYmd(r.endDate)
                                      ? ` ~ ${formatDateOnly(r.endDate)}`
                                      : ""}
                                  </td>
                                  <td className="px-4 py-3 text-slate-300">{leaveTypeLabel(r.type)}</td>
                                  <td className="px-4 py-3 font-mono">{formatLeaves(days)}일</td>
                                  <td className="px-4 py-3 text-slate-400">{r.reason ?? "—"}</td>
                                  <td className="px-4 py-3">
                                    <span
                                      className={
                                        r.status === "APPROVED"
                                          ? "text-emerald-400"
                                          : r.status === "REJECTED"
                                            ? "text-rose-400"
                                            : "text-amber-400"
                                      }
                                    >
                                      {leaveStatusLabel(r.status)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {isAdmin && (
                  <section className="rounded-2xl border border-slate-600/50 bg-slate-900/80 p-6 text-slate-300 text-sm leading-relaxed">
                    <h2 className="text-lg font-semibold text-amber-200 mb-3">전 직원 연차</h2>
                    <p>
                      전 직원의 부여·사용·잔여 일수는 관리 메뉴의{" "}
                      <Link href="/admin/employee-leave-summary" className="text-cyan-300 underline-offset-2 hover:underline">
                        직원 연차 현황
                      </Link>
                      에서 확인할 수 있습니다. 입사일 수정은{" "}
                      <Link href="/admin/employees" className="text-cyan-300 underline-offset-2 hover:underline">
                        직원 관리
                      </Link>
                      에서 할 수 있습니다.
                    </p>
                  </section>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
