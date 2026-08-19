"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/api-swr";
import type { IdleLiveStatus } from "@/lib/attendance-idle";
import { formatKstHm, formatKstMdEeeHm, toKstYmd } from "@/lib/date-kst";
import { PageHeadline } from "@/components/page-headline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorChip, NameWithBirthday } from "@/components/ui/color-chip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Totals = {
  count: number;
  durationMs: number;
};

type Session = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  ymd: string;
};

type Api = {
  now: string;
  today: string;
  weekStart: string;
  weekDays: string[];
  current: {
    id: string;
    userId: string;
    name: string;
    department: string | null;
    startedAt: string;
    elapsedMs: number;
    birthdayToday: boolean;
  }[];
  totals: {
    userId: string;
    name: string;
    department: string | null;
    birthdayToday: boolean;
    today: Totals;
    week: Totals;
    month: Totals;
    byYmd: Record<string, Totals>;
    sessions: Session[];
  }[];
  liveStatus: {
    employeeId: string;
    status: IdleLiveStatus;
    lastSeen: string;
  }[];
};

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function fmtDur(ms: number): string {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}시간 ${min}분`;
  return `${min}분`;
}

function formatSessionRange(s: Session): string {
  const start = formatKstMdEeeHm(s.startedAt);
  if (!s.endedAt) return `${start} ~ 진행 중`;
  if (toKstYmd(s.startedAt) === toKstYmd(s.endedAt)) {
    return `${start} ~ ${formatKstHm(s.endedAt)}`;
  }
  return `${start} ~ ${formatKstMdEeeHm(s.endedAt)}`;
}

function TotalsCell({
  t,
  onOpen,
}: {
  t: Totals | undefined;
  onOpen?: () => void;
}) {
  if (!t || t.count === 0) return <span className="text-muted-foreground">—</span>;
  if (!onOpen) {
    return (
      <span>
        {t.count}회 · {fmtDur(t.durationMs)}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="rounded-md px-1 py-0.5 text-left hover:bg-muted/70"
      onClick={onOpen}
    >
      <span className="font-semibold text-primary underline decoration-primary/40 underline-offset-2">
        {t.count}회
      </span>
      <span className="text-muted-foreground"> · {fmtDur(t.durationMs)}</span>
    </button>
  );
}

type DetailState = {
  name: string;
  title: string;
  sessions: Session[];
};

export function IdleOverviewClient() {
  const { data, error, isLoading, mutate } = useSWR<Api>("/api/attendance/idle/overview", jsonFetcher, {
    refreshInterval: 20_000,
    revalidateOnFocus: true,
  });
  const [detail, setDetail] = useState<DetailState | null>(null);

  const weekDays = data?.weekDays ?? [];
  const today = data?.today ?? "";
  const live = data?.liveStatus ?? [];
  const onlineCount = live.filter((r) => r.status === "online").length;
  const idleCount = live.filter((r) => r.status === "idle").length;
  const offlineCount = live.filter((r) => r.status === "offline").length;

  const openSessions = (name: string, title: string, sessions: Session[]) => {
    if (sessions.length === 0) return;
    setDetail({ name, title, sessions });
  };

  const weekdayHeaders = useMemo(
    () =>
      weekDays.map((ymd, i) => ({
        ymd,
        label: WEEKDAY_LABELS[i] ?? ymd,
        day: Number(ymd.slice(8, 10)),
        isToday: ymd === today,
      })),
    [weekDays, today]
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeadline
          title="자동 이석 현황"
          description="PC 입력이 없어 자동 감지된 이석입니다. 이번 주 요일별 횟수와 시간을 보고, 회를 누르면 감지 시각을 확인할 수 있습니다. 20초마다 새로고침합니다."
        />
        <Button type="button" variant="outline" size="sm" onClick={() => void mutate()}>
          새로고침
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">불러오지 못했습니다.</p>}
      {isLoading && !data && <p className="text-muted-foreground text-sm">불러오는 중…</p>}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="cs-section-title">현재 이석 중</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap items-end gap-6">
                <div className="flex items-end gap-3">
                  <p className="cs-stat tabular-nums">{data.current.length}</p>
                  <ColorChip tone="yellow">명</ColorChip>
                </div>
                <div className="flex items-end gap-2">
                  <p className="cs-stat tabular-nums">{idleCount}</p>
                  <ColorChip tone="yellow">이석 중</ColorChip>
                </div>
                <div className="flex items-end gap-2">
                  <p className="cs-stat tabular-nums">{onlineCount}</p>
                  <ColorChip tone="green">온라인</ColorChip>
                </div>
                <div className="flex items-end gap-2">
                  <p className="cs-stat tabular-nums">{offlineCount}</p>
                  <ColorChip tone="gray">오프라인</ColorChip>
                </div>
              </div>
              {data.current.length === 0 ? (
                <p className="text-muted-foreground text-sm">이석 중인 사람이 없습니다.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {data.current.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        <NameWithBirthday name={row.name} birthdayToday={row.birthdayToday} />
                      </span>
                      <ColorChip tone="yellow" size="sm">
                        {fmtDur(row.elapsedMs)} 경과
                      </ColorChip>
                      <span className="text-muted-foreground text-xs">
                        {formatKstMdEeeHm(row.startedAt)}부터
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-3 text-left">이름</th>
                  {weekdayHeaders.map((d) => (
                    <th
                      key={d.ymd}
                      className={cn(
                        "px-2 py-3 text-center font-medium",
                        d.isToday && "bg-primary/10 text-primary"
                      )}
                    >
                      <div>{d.label}</div>
                      <div className="text-muted-foreground text-[11px] font-normal">{d.day}일</div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-left">이번 주</th>
                  <th className="px-3 py-3 text-left">이번 달</th>
                </tr>
              </thead>
              <tbody>
                {data.totals.map((row) => (
                  <tr key={row.userId} className="border-t">
                    <td className="px-3 py-3 font-semibold">
                      <NameWithBirthday name={row.name} birthdayToday={row.birthdayToday} />
                      {row.department ? (
                        <div className="text-muted-foreground text-xs font-normal">{row.department}</div>
                      ) : null}
                    </td>
                    {weekDays.map((ymd) => (
                      <td
                        key={ymd}
                        className={cn("px-2 py-3 text-center", ymd === today && "bg-primary/5")}
                      >
                        <TotalsCell
                          t={row.byYmd?.[ymd]}
                          onOpen={() =>
                            openSessions(
                              row.name,
                              `${WEEKDAY_LABELS[weekDays.indexOf(ymd)] ?? ""}요일`,
                              row.sessions.filter((s) => s.ymd === ymd)
                            )
                          }
                        />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <TotalsCell
                        t={row.week}
                        onOpen={() =>
                          openSessions(
                            row.name,
                            "이번 주",
                            row.sessions.filter((s) => weekDays.includes(s.ymd))
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <TotalsCell
                        t={row.month}
                        onOpen={() => openSessions(row.name, "이번 달", row.sessions)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={detail != null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {detail?.name} · {detail?.title}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <ul className="space-y-2 text-sm">
              {detail.sessions.map((s) => (
                <li key={s.id} className="rounded-md border px-3 py-2">
                  <div className="font-medium">{formatSessionRange(s)}</div>
                  <div className="text-muted-foreground text-xs">{fmtDur(s.durationMs)}</div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
