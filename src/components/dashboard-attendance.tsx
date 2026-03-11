"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";

type TodayAttendance = {
  id: string;
  checkIn: string | null;
  checkOut: string | null;
  date: string;
} | null;

export function DashboardAttendance({
  initial,
  onUpdate,
}: {
  initial: TodayAttendance;
  onUpdate?: () => void;
}) {
  const router = useRouter();
  const [attendance, setAttendance] = useState(initial);
  const [loading, setLoading] = useState(false);

  // 서버에서 넘어온 '오늘 출근함' 상태가 있으면 퇴근 버튼 유지 (새로고침/다른 페이지 갔다 와도 퇴근 누를 때까지 고정)
  // initial에 checkIn이 있을 때만 반영 (null이나 빈 값으로 덮어쓰지 않음)
  useEffect(() => {
    const next = normalize(initial as Record<string, unknown> | null);
    if (next != null && next.checkIn != null) {
      setAttendance(next);
    }
  }, [initial]);

  const normalize = (raw: Record<string, unknown> | null): TodayAttendance => {
    if (!raw || !raw.id) return null;
    return {
      id: String(raw.id),
      checkIn: raw.checkIn != null && raw.checkIn !== "" ? String(raw.checkIn) : null,
      checkOut: raw.checkOut != null && raw.checkOut !== "" ? String(raw.checkOut) : null,
      date: raw.date != null ? String(raw.date) : "",
    };
  };

  const afterUpdate = () => {
    if (onUpdate) onUpdate();
    else router.refresh();
  };

  const handleCheckIn = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkIn" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "출근 처리 실패");
      setAttendance(normalize(data));
      toast.success("출근 처리되었습니다.");
      // 버튼이 퇴근으로 바뀐 뒤에만 새로고침 (refresh가 상태를 덮어쓰지 않도록 지연)
      setTimeout(afterUpdate, 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "출근 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkOut" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "퇴근 처리 실패");
      setAttendance(normalize(data));
      toast.success("퇴근 처리되었습니다.");
      setTimeout(afterUpdate, 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "퇴근 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const hasCheckedIn = attendance?.checkIn != null;
  const hasCheckedOut = attendance?.checkOut != null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={handleCheckIn}
        disabled={loading || hasCheckedIn}
        variant={hasCheckedIn ? "ghost" : "default"}
      >
        <LogIn className="mr-2 size-4" />
        출근
      </Button>
      <Button
        variant="secondary"
        onClick={handleCheckOut}
        disabled={loading || !hasCheckedIn || hasCheckedOut}
      >
        <LogOut className="mr-2 size-4" />
        퇴근
      </Button>
      {hasCheckedOut && (
        <span className="text-muted-foreground text-sm">
          오늘 퇴근 완료
        </span>
      )}
    </div>
  );
}
