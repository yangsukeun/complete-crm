"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Bath, Cigarette, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  canUseAwayFeature,
  notifyAwayStatusChanged,
  type AwayTypeName,
} from "@/lib/attendance-away-access";

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
  const { data: session } = useSession();
  const [attendance, setAttendance] = useState(initial);
  const [loading, setLoading] = useState(false);

  const showAway = canUseAwayFeature({
    department: session?.user?.department,
    permissions: (session?.user as { permissions?: string | null } | undefined)?.permissions,
  });

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
      notifyAwayStatusChanged();
      toast.success("퇴근 처리되었습니다.");
      setTimeout(afterUpdate, 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "퇴근 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleAway = async (type: AwayTypeName) => {
    setLoading(true);
    try {
      const res = await fetch("/api/attendance/away/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "이석 시작 실패");
      notifyAwayStatusChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "이석을 시작하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const hasCheckedIn = attendance?.checkIn != null;
  const hasCheckedOut = attendance?.checkOut != null;
  const awayEnabled = showAway && hasCheckedIn && !hasCheckedOut;

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
      {showAway && (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleAway("BATHROOM")}
            disabled={loading || !awayEnabled}
          >
            <Bath className="mr-2 size-4" />
            화장실
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleAway("SMOKING")}
            disabled={loading || !awayEnabled}
          >
            <Cigarette className="mr-2 size-4" />
            흡연
          </Button>
        </>
      )}
      {hasCheckedOut && (
        <span className="text-muted-foreground text-sm">오늘 퇴근 완료</span>
      )}
    </div>
  );
}
