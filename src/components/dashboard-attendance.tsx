"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Bath, Cigarette, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatKstHm } from "@/lib/date-kst";
import {
  AWAY_STATUS_EVENT,
  canUseAwayFeature,
  formatAwayDuration,
  liveAwayBreakdown,
  notifyAwayStatusChanged,
  type AwayDaySummary,
  type AwayTypeName,
} from "@/lib/attendance-away-access";

type TodayAttendance = {
  id: string;
  checkIn: string | null;
  checkOut: string | null;
  date: string;
} | null;

type AwayStatusPayload = {
  open?: boolean;
  id?: string;
  type?: AwayTypeName;
  startedAt?: string;
  todayEndedMs?: number;
  bathroomEndedMs?: number;
  smokingEndedMs?: number;
};

const emptyAway: AwayDaySummary = {
  todayEndedMs: 0,
  bathroomEndedMs: 0,
  smokingEndedMs: 0,
  open: null,
};

export function DashboardAttendance({
  initial,
  initialAway,
  onUpdate,
  emphasized = false,
  showAway: showAwayProp,
}: {
  initial: TodayAttendance;
  initialAway?: AwayDaySummary;
  onUpdate?: () => void;
  /** CS 홈: 큰 버튼 + 출근·자리비움 시각 */
  emphasized?: boolean;
  showAway?: boolean;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [attendance, setAttendance] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [away, setAway] = useState<AwayDaySummary>(initialAway ?? emptyAway);
  const [nowMs, setNowMs] = useState(0);

  const showAway =
    showAwayProp ??
    canUseAwayFeature({
      department: session?.user?.department,
      permissions: (session?.user as { permissions?: string | null } | undefined)?.permissions,
    });

  useEffect(() => {
    const next = normalize(initial as Record<string, unknown> | null);
    if (next != null && next.checkIn != null) {
      setAttendance(next);
    }
  }, [initial]);

  useEffect(() => {
    if (initialAway) setAway(initialAway);
  }, [initialAway]);

  useEffect(() => {
    if (!showAway && !emphasized) return;
    const apply = (data: AwayStatusPayload) => {
      setAway({
        todayEndedMs: data.todayEndedMs ?? 0,
        bathroomEndedMs: data.bathroomEndedMs ?? 0,
        smokingEndedMs: data.smokingEndedMs ?? 0,
        open:
          data.open && data.id && data.type && data.startedAt
            ? { id: data.id, type: data.type, startedAt: data.startedAt }
            : null,
      });
    };
    const load = async () => {
      try {
        const res = await fetch("/api/attendance/away/status");
        const data = (await res.json()) as AwayStatusPayload;
        if (res.ok) apply(data);
      } catch {
        /* 네트워크 오류 시 기존 값 유지 */
      }
    };
    void load();
    const onChange = () => void load();
    window.addEventListener(AWAY_STATUS_EVENT, onChange);
    return () => window.removeEventListener(AWAY_STATUS_EVENT, onChange);
  }, [showAway, emphasized]);

  useEffect(() => {
    if (!emphasized) return;
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [emphasized]);

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
  const awayLive = liveAwayBreakdown(away, nowMs);
  const showTimes = emphasized;

  const btnBase = emphasized
    ? "h-14 min-w-[8.5rem] rounded-xl px-5 text-base font-semibold shadow-sm [&_svg]:size-6"
    : "";

  const buttons = (
    <div className={cn("flex flex-wrap items-center gap-2", emphasized && "gap-3")}>
      <Button
        onClick={handleCheckIn}
        disabled={loading || hasCheckedIn}
        variant={emphasized ? "ghost" : hasCheckedIn ? "ghost" : "default"}
        className={cn(
          btnBase,
          emphasized &&
            (hasCheckedIn
              ? "border-2 border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-50"
              : "bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white"),
        )}
      >
        <LogIn className="mr-2 size-4" />
        출근
      </Button>
      <Button
        variant={emphasized ? "ghost" : "secondary"}
        onClick={handleCheckOut}
        disabled={loading || !hasCheckedIn || hasCheckedOut}
        className={cn(
          btnBase,
          emphasized &&
            (hasCheckedOut
              ? "border-2 border-rose-500 bg-rose-50 text-rose-800 hover:bg-rose-50"
              : "bg-rose-600 text-white hover:bg-rose-700 hover:text-white"),
        )}
      >
        <LogOut className="mr-2 size-4" />
        퇴근
      </Button>
      {showAway && (
        <>
          <Button
            type="button"
            variant={emphasized ? "ghost" : "outline"}
            onClick={() => void handleAway("BATHROOM")}
            disabled={loading || !awayEnabled}
            className={cn(
              btnBase,
              emphasized && "bg-sky-600 text-white hover:bg-sky-700 hover:text-white",
            )}
          >
            <Bath className="mr-2 size-4" />
            화장실
          </Button>
          <Button
            type="button"
            variant={emphasized ? "ghost" : "outline"}
            onClick={() => void handleAway("SMOKING")}
            disabled={loading || !awayEnabled}
            className={cn(
              btnBase,
              emphasized && "bg-amber-500 text-white hover:bg-amber-600 hover:text-white",
            )}
          >
            <Cigarette className="mr-2 size-4" />
            흡연
          </Button>
        </>
      )}
      {hasCheckedOut && !emphasized && (
        <span className="text-muted-foreground text-sm">오늘 퇴근 완료</span>
      )}
    </div>
  );

  if (!showTimes) {
    return buttons;
  }

  return (
    <section className="bg-card text-card-foreground w-full rounded-xl border p-4 shadow-sm sm:p-5">
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TimeStat
          label="출근"
          value={attendance?.checkIn ? formatKstHm(attendance.checkIn) : "—"}
          accent="text-emerald-700"
          done={hasCheckedIn}
        />
        <TimeStat
          label="자리 비움"
          value={showAway ? formatAwayDuration(awayLive.totalMs) : "—"}
          accent="text-sky-700"
          done={awayLive.totalMs > 0}
          hint={
            showAway && (awayLive.bathroomMs > 0 || awayLive.smokingMs > 0)
              ? [
                  awayLive.bathroomMs > 0 ? `화장실 ${formatAwayDuration(awayLive.bathroomMs)}` : null,
                  awayLive.smokingMs > 0 ? `흡연 ${formatAwayDuration(awayLive.smokingMs)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
        />
        <TimeStat
          label="퇴근"
          value={attendance?.checkOut ? formatKstHm(attendance.checkOut) : "—"}
          accent="text-rose-700"
          done={hasCheckedOut}
        />
      </div>
      {buttons}
    </section>
  );
}

function TimeStat({
  label,
  value,
  accent,
  done,
  hint,
}: {
  label: string;
  value: string;
  accent: string;
  done: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-4 py-3">
      <p className="text-muted-foreground text-sm font-medium">{label}</p>
      <p
        className={cn(
          "mt-1 text-3xl font-semibold tracking-tight tabular-nums",
          done ? accent : "text-muted-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}
