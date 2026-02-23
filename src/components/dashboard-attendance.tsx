"use client";

import { useState } from "react";
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
      setAttendance(data);
      afterUpdate();
      toast.success("출근 처리되었습니다.");
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
      setAttendance(data);
      afterUpdate();
      toast.success("퇴근 처리되었습니다.");
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
      {!hasCheckedIn && (
        <Button onClick={handleCheckIn} disabled={loading}>
          <LogIn className="mr-2 size-4" />
          출근
        </Button>
      )}
      {hasCheckedIn && !hasCheckedOut && (
        <Button variant="secondary" onClick={handleCheckOut} disabled={loading}>
          <LogOut className="mr-2 size-4" />
          퇴근
        </Button>
      )}
      {hasCheckedOut && (
        <span className="text-muted-foreground text-sm">
          오늘 퇴근 완료
        </span>
      )}
    </div>
  );
}
