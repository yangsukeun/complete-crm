"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorChip } from "@/components/ui/color-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DashboardAttendance } from "@/components/dashboard-attendance";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarPlus, ChevronDown, ChevronUp, LogIn } from "lucide-react";
import { cn, formatUserName } from "@/lib/utils";
import { PageHeadline } from "@/components/page-headline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { leaveDisplayDays } from "@/lib/leave-request-serialize";
import { leaveStatusChipTone } from "@/lib/color-chip";
import { useAutoReadOnEnter } from "@/hooks/use-auto-read-on-enter";
import { mutate } from "swr";
import { SWR_KEYS } from "@/lib/api-swr";

function leaveNeedsDateRange(t: string): boolean {
  return t === "ANNUAL" || t === "SICK_PAID" || t === "SICK_UNPAID";
}

function statusHint(s: string): string {
  if (s === "PENDING") return "팀장 1차 승인 대기";
  if (s === "TEAM_LEAD_APPROVED") return "대표·관리자 최종 승인 대기";
  if (s === "APPROVED") return "승인 완료";
  if (s === "CANCEL_REQUESTED") return "취소 승인 대기";
  if (s === "CANCELLED") return "취소됨";
  if (s === "REJECTED") return "반려됨";
  return "";
}

const LEAVE_TYPES: { value: string; label: string }[] = [
  { value: "ANNUAL", label: "연차" },
  { value: "HALF_AM", label: "오전 반차" },
  { value: "HALF_PM", label: "오후 반차" },
  { value: "QUARTER_AM", label: "오전 반반차" },
  { value: "QUARTER_PM", label: "오후 반반차" },
  { value: "SICK_PAID", label: "유급 병가" },
  { value: "SICK_UNPAID", label: "무급 병가" },
];

type LeaveRequest = {
  id: string;
  userId?: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  cancelFromStatus?: string | null;
  reason: string | null;
  user?: {
    id: string;
    name: string;
    email?: string;
    department: string | null;
    position?: string | null;
    role?: string;
    currentProject?: { name: string; brand: { name: string } } | null;
  };
};

type Balance = {
  year: number;
  total: number;
  annualTotal?: number;
  carryOver?: number;
  used: number;
  manualDeduction?: number;
  remaining: number;
};

type TodayAttendance = {
  id: string;
  checkIn: string | null;
  checkOut: string | null;
  date: string;
} | null;

function leaveStatusLabel(s: string) {
  if (s === "PENDING") return "1차 대기";
  if (s === "TEAM_LEAD_APPROVED") return "2차 대기";
  if (s === "APPROVED") return "승인";
  if (s === "CANCEL_REQUESTED") return "취소 요청";
  if (s === "CANCELLED") return "취소 완료";
  return "반려";
}

function LeaveStatusMark({ status }: { status: string }) {
  return <ColorChip tone={leaveStatusChipTone(status)}>{leaveStatusLabel(status)}</ColorChip>;
}

export function LeavePageClient({
  isTeamLead,
  isExecutive,
  csScreen = false,
}: {
  isTeamLead: boolean;
  isExecutive: boolean;
  csScreen?: boolean;
}) {
  const canApprove = isTeamLead || isExecutive;
  const { data: session } = useSession();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [viewerDepartment, setViewerDepartment] = useState<string | null>(null);
  const [departmentsWithTeamLead, setDepartmentsWithTeamLead] = useState<string[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendance>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("ANNUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<"mine" | "peers" | "approve">("mine");
  const [peerNameQ, setPeerNameQ] = useState("");
  const [peerTypeQ, setPeerTypeQ] = useState<string>("");
  const [peerFrom, setPeerFrom] = useState("");
  const [peerTo, setPeerTo] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [balanceDetailOpen, setBalanceDetailOpen] = useState(false);

  // /leave 진입 시: 휴가 관련 알림(목록 링크 기반 포함) 디바운스 자동 읽음
  useAutoReadOnEnter(
    {
      relatedType: "LEAVE",
      relatedId: null,
      linkFallback: ["/leave"],
    },
    "leave"
  );

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/leave");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRequests(data.requests);
      setViewerDepartment(data.viewer?.department ?? null);
      setDepartmentsWithTeamLead(Array.isArray(data.departmentsWithTeamLead) ? data.departmentsWithTeamLead : []);
      setBalance(data.balance);
    } catch {
      setRequests([]);
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAttendance = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        const mine = data.find((a: { userId: string }) => a.userId === session?.user?.id);
        setTodayAttendance(
          mine
            ? {
                id: mine.id,
                checkIn: mine.checkIn ? new Date(mine.checkIn).toISOString() : null,
                checkOut: mine.checkOut ? new Date(mine.checkOut).toISOString() : null,
                date: new Date(mine.date).toISOString(),
              }
            : null
        );
      } else {
        setTodayAttendance(
          data
            ? {
                id: data.id,
                checkIn: data.checkIn ? new Date(data.checkIn).toISOString() : null,
                checkOut: data.checkOut ? new Date(data.checkOut).toISOString() : null,
                date: new Date(data.date).toISOString(),
              }
            : null
        );
      }
    } catch {
      setTodayAttendance(null);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const needsRange = leaveNeedsDateRange(type);
  const previewDays = useMemo(() => {
    if (!startDate) return null;
    const s = new Date(startDate);
    const e = new Date(needsRange ? endDate || startDate : startDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
    return leaveDisplayDays(type, s, e);
  }, [type, startDate, endDate, needsRange]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!startDate) {
      toast.error("시작일을 선택하세요.");
      return;
    }
    if (needsRange && endDate && endDate < startDate) {
      toast.error("종료일은 시작일 이후여야 합니다.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(needsRange ? endDate || startDate : startDate).toISOString(),
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "신청 실패");
      toast.success("휴가가 신청되었습니다.");
      setStartDate("");
      setEndDate("");
      setReason("");
      setRequestOpen(false);
      await fetchData();
      void mutate(SWR_KEYS.leave);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "신청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatus = async (
    id: string,
    status: "TEAM_LEAD_APPROVED" | "APPROVED" | "REJECTED" | "CANCEL_REQUESTED" | "CANCELLED"
  ) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "처리 실패");
      }
      toast.success(
        status === "REJECTED"
          ? "반려했습니다."
          : status === "TEAM_LEAD_APPROVED"
            ? "1차 승인했습니다."
            : status === "APPROVED"
              ? "2차 승인했습니다."
              : status === "CANCEL_REQUESTED"
                ? "취소를 요청했습니다."
                : "취소 처리했습니다."
      );
      // 액션 완료 시 해당 리소스(/leave) 관련 알림 자동 읽음
      try {
        await fetch("/api/notifications/auto-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ relatedType: "LEAVE", relatedId: null, linkFallback: ["/leave"] }),
        });
      } catch {
        /* ignore */
      }
      await fetchData();
      void mutate(SWR_KEYS.leave);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리에 실패했습니다.");
    } finally {
      setProcessingId(null);
    }
  };

  const typeLabel = (t: string) => LEAVE_TYPES.find((x) => x.value === t)?.label ?? t;

  const formatLeaveRange = (r: LeaveRequest) => {
    const start = format(new Date(r.startDate), "yyyy.MM.dd", { locale: ko });
    if (r.startDate.slice(0, 10) === r.endDate.slice(0, 10)) return start;
    return `${start} ~ ${format(new Date(r.endDate), "yyyy.MM.dd", { locale: ko })}`;
  };

  const myUid = session?.user?.id ?? "";

  const myRequests = useMemo(() => {
    if (!myUid) return [];
    return requests.filter((r) => r.user?.id === myUid);
  }, [requests, myUid]);

  const peerApprovedRequests = useMemo(() => {
    if (!myUid) return [];
    let list = requests.filter(
      (r) => r.status === "APPROVED" && r.user?.id && r.user.id !== myUid
    );
    const q = peerNameQ.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => (r.user?.name ?? "").toLowerCase().includes(q));
    }
    if (peerTypeQ) {
      list = list.filter((r) => r.type === peerTypeQ);
    }
    if (peerFrom) {
      const from = new Date(peerFrom);
      from.setHours(0, 0, 0, 0);
      list = list.filter((r) => new Date(r.endDate) >= from);
    }
    if (peerTo) {
      const to = new Date(peerTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter((r) => new Date(r.startDate) <= to);
    }
    return list;
  }, [requests, myUid, peerNameQ, peerTypeQ, peerFrom, peerTo]);

  const deptHasTeamLead = useCallback(
    (dept: string | null | undefined) => {
      const d = (dept ?? "").trim();
      return d.length > 0 && departmentsWithTeamLead.some((x) => x.trim() === d);
    },
    [departmentsWithTeamLead]
  );

  const approvalQueue = useMemo(() => {
    if (!canApprove) return [];
    const myDept = (viewerDepartment ?? "").trim();
    const sameDept = (dept: string | null | undefined) =>
      myDept.length > 0 && (dept ?? "").trim() === myDept;

    return requests.filter((r) => {
      const isOwn = Boolean(myUid) && (r.userId === myUid || r.user?.id === myUid);
      const applicantIsTeamLead = String(r.user?.role ?? "").toUpperCase() === "TEAM_LEAD";
      if (isTeamLead && isOwn && !isExecutive) return false;
      if (isTeamLead && r.status === "PENDING") {
        if (applicantIsTeamLead) return false;
        return sameDept(r.user?.department);
      }
      if (isExecutive && r.status === "TEAM_LEAD_APPROVED") return true;
      if (
        isExecutive &&
        r.status === "PENDING" &&
        (applicantIsTeamLead || !deptHasTeamLead(r.user?.department))
      ) {
        return true;
      }
      if (r.status === "CANCEL_REQUESTED") {
        if (isTeamLead && r.cancelFromStatus === "PENDING") return sameDept(r.user?.department);
        if (
          isExecutive &&
          (r.cancelFromStatus === "PENDING" ||
            r.cancelFromStatus === "TEAM_LEAD_APPROVED" ||
            r.cancelFromStatus === "APPROVED")
        ) {
          if (r.cancelFromStatus === "PENDING" && deptHasTeamLead(r.user?.department)) {
            return false;
          }
          return true;
        }
      }
      return false;
    });
  }, [requests, canApprove, isTeamLead, isExecutive, viewerDepartment, deptHasTeamLead, myUid]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <p className="text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div data-cs-screen className="flex flex-col gap-8 p-6 md:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2 min-w-0">
          <PageHeadline
            title="연차 / 근태"
            description="출퇴근 기록과 휴가 신청·조회를 한곳에서 합니다."
          />
          {canApprove && (
            <p className="text-muted-foreground max-w-xl text-xs leading-relaxed">
              승인: 팀장 1차 → 대표·관리자 최종. 팀장 없는 부서는 대표가 바로 승인.{" "}
              <Link href="/notifications" className="underline underline-offset-4 hover:no-underline">
                알림
              </Link>
            </p>
          )}
        </div>
        <Card className="sm:w-auto">
          <CardContent className="flex items-center gap-2 py-3">
            <LogIn className="text-muted-foreground size-5 shrink-0" />
            <span className="text-sm font-medium">오늘 출퇴근</span>
            <DashboardAttendance
              initial={todayAttendance}
              onUpdate={fetchAttendance}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        {balance != null && (
          <Card className="flex-1">
            <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-muted-foreground text-xs">{balance.year}년 사용 가능 잔여</p>
                <p className="cs-stat tracking-tight">
                  <span className="text-primary">{balance.remaining.toFixed(1)}</span>
                  <span className="text-muted-foreground ml-1 text-base font-medium">일</span>
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-auto self-start px-2 py-1 text-xs"
                onClick={() => setBalanceDetailOpen((v) => !v)}
              >
                {balanceDetailOpen ? (
                  <>
                    계산식 숨기기 <ChevronUp className="ml-1 size-3.5" />
                  </>
                ) : (
                  <>
                    계산식 보기 <ChevronDown className="ml-1 size-3.5" />
                  </>
                )}
              </Button>
            </CardContent>
            {balanceDetailOpen ? (
              <CardContent className="border-t pt-3 pb-4">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  입사일 기준 근로기준법 자동계산 · 전체 휴가(부여+이월) − 사용 − 실제 사용 차감 = 잔여
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {typeof balance.annualTotal === "number" && (balance.carryOver ?? 0) > 0 ? (
                    <>
                      부여 {balance.annualTotal}일 + 이월 {balance.carryOver!.toFixed(1)}일 = 총 {balance.total}일
                      {" − "}사용 {balance.used.toFixed(1)}일
                      {(balance.manualDeduction ?? 0) > 0 && (
                        <> − 실제 사용 차감 {balance.manualDeduction!.toFixed(1)}일</>
                      )}
                      {" = "}
                      {balance.remaining.toFixed(1)}일
                    </>
                  ) : (
                    <>
                      전체 휴가 {balance.total}일 − 사용 {balance.used.toFixed(1)}일
                      {(balance.manualDeduction ?? 0) > 0 && (
                        <> − 실제 사용 차감 {balance.manualDeduction!.toFixed(1)}일</>
                      )}
                      {" = "}
                      {balance.remaining.toFixed(1)}일
                    </>
                  )}
                </p>
              </CardContent>
            ) : null}
          </Card>
        )}

        <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
          <DialogTrigger asChild>
            <Button className="h-auto min-h-11 shrink-0 gap-2 px-5 py-3 text-base sm:self-center">
              <CalendarPlus className="size-5" />
              휴가 신청
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>휴가 신청</DialogTitle>
              <DialogDescription>
                종류와 날짜만 고르면 됩니다. 병가는 연차 잔여와 무관합니다.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="space-y-2">
                <Label>종류</Label>
                <Select
                  value={type}
                  onValueChange={(v) => {
                    setType(v);
                    if (!leaveNeedsDateRange(v)) setEndDate("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={cn("grid gap-4", needsRange && "sm:grid-cols-2")}>
                <div className="space-y-2">
                  <Label htmlFor="leave-start">{needsRange ? "시작일" : "날짜"}</Label>
                  <Input
                    id="leave-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                {needsRange ? (
                  <div className="space-y-2">
                    <Label htmlFor="leave-end">종료일</Label>
                    <Input
                      id="leave-end"
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-reason">사유 (선택)</Label>
                <Textarea
                  id="leave-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="사유를 입력하세요"
                  rows={2}
                />
              </div>
              {previewDays != null ? (
                <p className="bg-muted/50 rounded-md px-3 py-2 text-sm">
                  약 <span className="font-semibold">{previewDays}</span>일 차감
                  {balance != null && !type.startsWith("SICK") ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · 신청 후 잔여 예상{" "}
                      <span className="text-foreground font-medium">
                        {Math.max(0, balance.remaining - previewDays).toFixed(1)}일
                      </span>
                    </span>
                  ) : null}
                  {type.startsWith("SICK") ? (
                    <span className="text-muted-foreground"> · 병가는 연차에서 차감되지 않습니다</span>
                  ) : null}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">날짜를 선택하면 차감 일수가 미리 표시됩니다.</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRequestOpen(false)}>
                  닫기
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "신청 중..." : "신청하기"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="cs-section-title">휴가 내역</CardTitle>
          <p className="text-muted-foreground text-xs font-normal">
            내 신청은 전 상태를 볼 수 있고, 동료의 승인된 휴가만 열람됩니다.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "mine" | "peers" | "approve")}>
            <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="mine">내 신청</TabsTrigger>
              <TabsTrigger value="peers">동료 휴가</TabsTrigger>
              {canApprove ? (
                <TabsTrigger value="approve" className="gap-1.5">
                  승인
                  {approvalQueue.length > 0 ? (
                    <ColorChip tone="red" size="sm">
                      {approvalQueue.length}
                    </ColorChip>
                  ) : null}
                </TabsTrigger>
              ) : null}
            </TabsList>

            <TabsContent value="mine" className="mt-0">
              {myRequests.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <p className="text-muted-foreground text-sm">아직 신청한 휴가가 없습니다.</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setRequestOpen(true)}>
                    <CalendarPlus className="mr-1.5 size-4" />
                    휴가 신청하기
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2 md:hidden">
                    {myRequests.map((r) => (
                      <div key={r.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{typeLabel(r.type)}</p>
                            <p className="text-muted-foreground text-sm">{formatLeaveRange(r)}</p>
                            <p className="text-muted-foreground text-xs">
                              {leaveDisplayDays(r.type, new Date(r.startDate), new Date(r.endDate))}일
                              {r.reason ? ` · ${r.reason}` : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            <LeaveStatusMark status={r.status} />
                            <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
                              {statusHint(r.status)}
                            </p>
                          </div>
                        </div>
                        {["PENDING", "TEAM_LEAD_APPROVED", "APPROVED"].includes(r.status) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 w-full"
                            disabled={processingId === r.id}
                            onClick={() => {
                              if (!confirm("이 휴가 신청을 취소 요청할까요?")) return;
                              void handleStatus(r.id, "CANCEL_REQUESTED");
                            }}
                          >
                            취소 요청
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 pr-2">종류</th>
                          <th className="pb-2 pr-2">기간</th>
                          <th className="pb-2 pr-2">일수</th>
                          <th className="pb-2 pr-2">상태</th>
                          <th className="pb-2">사유</th>
                          <th className="pb-2">취소</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myRequests.map((r) => (
                          <tr key={r.id} className="border-b">
                            <td className="py-2 pr-2">{typeLabel(r.type)}</td>
                            <td className="py-2 pr-2">{formatLeaveRange(r)}</td>
                            <td className="py-2 pr-2">
                              {leaveDisplayDays(r.type, new Date(r.startDate), new Date(r.endDate))}일
                            </td>
                            <td className="py-2 pr-2">
                              <div className="flex flex-col gap-0.5">
                                <LeaveStatusMark status={r.status} />
                                <span className="text-muted-foreground text-[11px]">{statusHint(r.status)}</span>
                              </div>
                            </td>
                            <td className="text-muted-foreground max-w-[200px] truncate py-2" title={r.reason ?? ""}>
                              {r.reason ?? "—"}
                            </td>
                            <td className="py-2">
                              {["PENDING", "TEAM_LEAD_APPROVED", "APPROVED"].includes(r.status) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={processingId === r.id}
                                  onClick={() => {
                                    if (!confirm("이 휴가 신청을 취소 요청할까요?")) return;
                                    void handleStatus(r.id, "CANCEL_REQUESTED");
                                  }}
                                >
                                  취소 요청
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="peers" className="mt-0 space-y-4">
              <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
                <div className="space-y-1">
                  <Label className="text-xs">이름 검색</Label>
                  <Input
                    className="h-9 w-40"
                    placeholder="이름"
                    value={peerNameQ}
                    onChange={(e) => setPeerNameQ(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">휴가 유형</Label>
                  <Select value={peerTypeQ || "__ALL__"} onValueChange={(v) => setPeerTypeQ(v === "__ALL__" ? "" : v)}>
                    <SelectTrigger className="h-9 w-40">
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ALL__">전체</SelectItem>
                      {LEAVE_TYPES.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">기간 시작(이후)</Label>
                  <Input className="h-9 w-36" type="date" value={peerFrom} onChange={(e) => setPeerFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">기간 종료(이전)</Label>
                  <Input className="h-9 w-36" type="date" value={peerTo} onChange={(e) => setPeerTo(e.target.value)} />
                </div>
              </div>
              {peerApprovedRequests.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  조건에 맞는 승인 휴가가 없습니다.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-2">이름</th>
                        <th className="pb-2 pr-2">유형</th>
                        <th className="pb-2 pr-2">기간</th>
                        <th className="pb-2 pr-2">일수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {peerApprovedRequests.map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="py-2 pr-2">
                            {r.user ? formatUserName(r.user) : "—"}
                            {r.user?.department ? ` · ${r.user.department}` : ""}
                          </td>
                          <td className="py-2 pr-2">{typeLabel(r.type)}</td>
                          <td className="py-2 pr-2">
                            {format(new Date(r.startDate), "yyyy.MM.dd", { locale: ko })}
                            {r.startDate.slice(0, 10) !== r.endDate.slice(0, 10) &&
                              ` ~ ${format(new Date(r.endDate), "yyyy.MM.dd", { locale: ko })}`}
                          </td>
                          <td className="py-2 pr-2">
                            {leaveDisplayDays(r.type, new Date(r.startDate), new Date(r.endDate))}일
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {canApprove ? (
              <TabsContent value="approve" className="mt-0">
                {approvalQueue.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center text-sm">처리할 신청이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2 pr-2">신청자</th>
                          <th className="pb-2 pr-2">종류</th>
                          <th className="pb-2 pr-2">기간</th>
                          <th className="pb-2 pr-2">상태</th>
                          <th className="pb-2 pr-2">사유</th>
                          <th className="pb-2">처리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {approvalQueue.map((r) => (
                          <tr key={r.id} className="border-b">
                            <td className="py-2 pr-2">
                              {r.user ? formatUserName(r.user) : "—"}
                              {r.user?.department ? ` · ${r.user.department}` : ""}
                            </td>
                            <td className="py-2 pr-2">{typeLabel(r.type)}</td>
                            <td className="py-2 pr-2">
                              {format(new Date(r.startDate), "yyyy.MM.dd", { locale: ko })}
                              {r.startDate.slice(0, 10) !== r.endDate.slice(0, 10) &&
                                ` ~ ${format(new Date(r.endDate), "yyyy.MM.dd", { locale: ko })}`}
                            </td>
                            <td className="py-2 pr-2">
                              <LeaveStatusMark status={r.status} />
                            </td>
                            <td className="max-w-[160px] truncate py-2 text-muted-foreground text-xs" title={r.reason ?? ""}>
                              {r.reason ?? "—"}
                            </td>
                            <td className="py-2">
                              {r.status === "PENDING" && isTeamLead && (
                                <div className="flex flex-wrap gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={processingId === r.id}
                                    onClick={() => handleStatus(r.id, "TEAM_LEAD_APPROVED")}
                                  >
                                    1차 승인
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={processingId === r.id}
                                    onClick={() => handleStatus(r.id, "REJECTED")}
                                  >
                                    반려
                                  </Button>
                                </div>
                              )}
                              {r.status === "PENDING" && isExecutive && (String(r.user?.role ?? "").toUpperCase() === "TEAM_LEAD" || !deptHasTeamLead(r.user?.department)) && (
                                <div className="flex flex-wrap gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={processingId === r.id}
                                    onClick={() => handleStatus(r.id, "APPROVED")}
                                  >
                                    승인
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={processingId === r.id}
                                    onClick={() => handleStatus(r.id, "REJECTED")}
                                  >
                                    반려
                                  </Button>
                                </div>
                              )}
                              {r.status === "TEAM_LEAD_APPROVED" && isExecutive && (
                                <div className="flex flex-wrap gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={processingId === r.id}
                                    onClick={() => handleStatus(r.id, "APPROVED")}
                                  >
                                    2차 승인
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={processingId === r.id}
                                    onClick={() => handleStatus(r.id, "REJECTED")}
                                  >
                                    반려
                                  </Button>
                                </div>
                              )}
                              {r.status === "CANCEL_REQUESTED" && (
                                <div className="flex flex-wrap gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={processingId === r.id}
                                    onClick={() => handleStatus(r.id, "CANCELLED")}
                                  >
                                    취소 처리
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            ) : null}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
