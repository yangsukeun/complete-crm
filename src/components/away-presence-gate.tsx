"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  AWAY_STATUS_EVENT,
  formatAwayDuration,
  notifyAwayStatusChanged,
} from "@/lib/attendance-away-access";
import { toast } from "sonner";

type AwayOpen = {
  open: true;
  id: string;
  startedAt: string;
};

export function AwayPresenceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [away, setAway] = useState<AwayOpen | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);

  const isPublic =
    pathname === "/login" || pathname === "/signup" || pathname.startsWith("/login/");

  const refresh = useCallback(async () => {
    if (!session?.user?.id) {
      setAway(null);
      return;
    }
    try {
      const res = await fetch("/api/attendance/away/status");
      const data = (await res.json()) as { open?: boolean; startedAt?: string; id?: string };
      if (res.ok && data.open && data.startedAt && data.id) {
        setAway({
          open: true,
          id: data.id,
          startedAt: data.startedAt,
        });
      } else {
        setAway(null);
      }
    } catch {
      /* 네트워크 오류 시 기존 화면 유지 */
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (isPublic || status !== "authenticated") {
      setAway(null);
      return;
    }
    void refresh();
  }, [isPublic, status, refresh]);

  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener(AWAY_STATUS_EVENT, onChange);
    return () => window.removeEventListener(AWAY_STATUS_EVENT, onChange);
  }, [refresh]);

  useEffect(() => {
    if (!away) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [away]);

  const handleReturn = async () => {
    setEnding(true);
    try {
      const res = await fetch("/api/attendance/away/end", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "복귀에 실패했습니다.");
      setAway(null);
      notifyAwayStatusChanged();
      toast.success("복귀했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "복귀에 실패했습니다.");
    } finally {
      setEnding(false);
    }
  };

  if (!isPublic && away) {
    const elapsed = formatAwayDuration(now - new Date(away.startedAt).getTime());
    return (
      <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-8 p-6">
        <h1 className="text-4xl font-semibold">부재중</h1>
        <p className="font-mono text-3xl tabular-nums">{elapsed}</p>
        <Button size="lg" onClick={() => void handleReturn()} disabled={ending}>
          {ending ? "처리 중…" : "복귀"}
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
