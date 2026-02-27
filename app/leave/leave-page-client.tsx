"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardAttendance } from "@/components/dashboard-attendance";
import { toast } from "sonner";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarClock, LogIn } from "lucide-react";
import { formatUserName } from "@/lib/utils";
import { PageHeadline } from "@/components/page-headline";

const LEAVE_TYPES: { value: string; label: string }[] = [
  { value: "ANNUAL", label: "연차" },
  { value: "HALF_AM", label: "오전 반차" },
  { value: "HALF_PM", label: "오후 반차" },
  { value: "QUARTER_AM", label: "오전 반반차" },
  { value: "QUARTER_PM", label: "오후 반반차" },
];

type LeaveRequest = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  reason: string | null;
  user?: { id: string; name: string; email: string; department: string | null; position?: string | null };
};

type Balance = {
  year: number;
  total: number;
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

export function LeavePageClient({
  isTeamLead,
  isExecutive,
}: {
  isTeamLead: boolean;
  isExecutive: boolean;
}) {
  const canApprove = isTeamLead || isExecutive;
  const { data: session } = useSession();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendance>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("ANNUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/leave");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRequests(data.requests);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate) {
      toast.error("시작일을 선택하세요.");
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
          endDate: new Date(endDate || startDate).toISOString(),
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "신청 실패");
      toast.success("휴가가 신청되었습니다.");
      setStartDate("");
      setEndDate("");
      setReason("");
      fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "신청에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatus = async (
    id: string,
    status: "TEAM_LEAD_APPROVED" | "APPROVED" | "REJECTED"
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
        status === "REJECTED" ? "반려했습니다." : status === "TEAM_LEAD_APPROVED" ? "1차 승인했습니다." : "2차 승인했습니다."
      );
      fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "처리에 실패했습니다.");
    } finally {
      setProcessingId(null);
    }
  };

  const statusLabel = (s: string) => {
    if (s === "PENDING") return "1차 대기";
    if (s === "TEAM_LEAD_APPROVED") return "2차 대기";
    if (s === "APPROVED") return "승인";
    return "반려";
  };
  const typeLabel = (t: string) => LEAVE_TYPES.find((x: any) => x.value === t)?.label ?? t;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <p className="text-muted-foreground">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeadline
          title="연차 / 근태"
          description="연차·반차·반반차를 신청하고, 출퇴근을 기록하세요."
        />
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

      {balance != null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{balance.year}년 연차 (입사일 기준 2026 근로기준법 자동계산)</CardTitle>
            <p className="text-muted-foreground text-xs">
              부여일 − 시스템 사용일 − 실제 사용 차감(최초 1회) = 잔여일
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              잔여 <span className="text-primary">{balance.remaining.toFixed(1)}</span>일
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              부여 {balance.total}일 − 사용 {balance.used.toFixed(1)}일
              {(balance.manualDeduction ?? 0) > 0 && (
                <> − 실제 사용 차감 {balance.manualDeduction!.toFixed(1)}일</>
              )}
              {" = "}
              {balance.remaining.toFixed(1)}일
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>휴가 신청</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>종류</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((opt: any) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="start">시작일</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e: any) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">종료일 (연차만 해당)</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e: any) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="reason">사유 (선택)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e: any) => setReason(e.target.value)}
                placeholder="사유를 입력하세요"
                rows={2}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "신청 중..." : "신청하기"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>사용 내역</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              신청 내역이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    {canApprove && <th className="pb-2 pr-2">신청자</th>}
                    <th className="pb-2 pr-2">종류</th>
                    <th className="pb-2 pr-2">기간</th>
                    <th className="pb-2 pr-2">상태</th>
                    {canApprove && <th className="pb-2">처리</th>}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r: any) => (
                    <tr key={r.id} className="border-b">
                      {canApprove && r.user && (
                        <td className="py-2 pr-2">
                          {formatUserName(r.user)}
                          {r.user.department ? ` · ${r.user.department}` : ""}
                        </td>
                      )}
                      <td className="py-2 pr-2">{typeLabel(r.type)}</td>
                      <td className="py-2 pr-2">
                        {format(new Date(r.startDate), "yyyy.MM.dd", { locale: ko })}
                        {r.startDate !== r.endDate &&
                          ` ~ ${format(new Date(r.endDate), "yyyy.MM.dd", { locale: ko })}`}
                      </td>
                      <td className="py-2 pr-2">
                        <Badge
                          variant={
                            r.status === "APPROVED"
                              ? "default"
                              : r.status === "REJECTED"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {statusLabel(r.status)}
                        </Badge>
                      </td>
                      {canApprove && (
                        <td className="py-2">
                          {r.status === "PENDING" && isTeamLead && (
                            <div className="flex gap-1">
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
                          {r.status === "TEAM_LEAD_APPROVED" && isExecutive && (
                            <div className="flex gap-1">
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
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
