"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { jsonFetcher } from "@/lib/api-swr";
import { PageHeadline } from "@/components/page-headline";
import { Button } from "@/components/ui/button";
import { ColorChip } from "@/components/ui/color-chip";
import { addDaysKstYmd, formatKstHm, todayYmdKst } from "@/lib/date-kst";
import { formatDurationMinutes } from "@/lib/attendance-away-access";
import { attendanceStatusChipTone } from "@/lib/color-chip";

type Status = "AWAY" | "OUT" | "IN" | "ABSENT";

type MemberRow = {
  userId: string;
  name: string;
  department: string | null;
  position: string | null;
  checkIn: string | null;
  checkOut: string | null;
  awayMs: number;
  workedMs: number | null;
  status: Status;
  awayOpenType: string | null;
};

type Api = {
  date: string;
  now: string;
  members: MemberRow[];
};

function statusChip(status: Status) {
  if (status === "AWAY") return { label: "부재중", tone: attendanceStatusChipTone(status) };
  if (status === "OUT") return { label: "퇴근", tone: attendanceStatusChipTone(status) };
  if (status === "IN") return { label: "근무중", tone: attendanceStatusChipTone(status) };
  return { label: "미출근", tone: attendanceStatusChipTone(status) };
}

export function CsTeamAttendanceClient() {
  const today = useMemo(() => todayYmdKst(), []);
  const [date, setDate] = useState(today);
  const { data, error, isLoading, mutate } = useSWR<Api>(
    `/api/attendance/cs-team?date=${encodeURIComponent(date)}`,
    jsonFetcher,
    { refreshInterval: 20_000, revalidateOnFocus: true },
  );

  const members = data?.members ?? [];
  const inCount = members.filter((m) => m.status === "IN" || m.status === "AWAY").length;
  const outCount = members.filter((m) => m.status === "OUT").length;
  const absentCount = members.filter((m) => m.status === "ABSENT").length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeadline
          title="CS팀 출퇴근"
          description="CS팀원만 표시합니다. 근무시간은 출근~퇴근에서 자리 비움 시간을 뺀 값입니다."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setDate((d) => addDaysKstYmd(d, -1))}>
            이전 날
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setDate(v);
            }}
            className="border-input bg-background h-8 rounded-md border px-2 text-sm"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => setDate((d) => addDaysKstYmd(d, 1))}>
            다음 날
          </Button>
          {date !== today && (
            <Button type="button" variant="outline" size="sm" onClick={() => setDate(today)}>
              오늘
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void mutate()}>
            새로고침
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href="/cs-tools/away">이석 현황</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div className="flex items-end gap-2">
          <p className="cs-stat tabular-nums">{inCount}</p>
          <ColorChip tone="green">근무중</ColorChip>
        </div>
        <div className="flex items-end gap-2">
          <p className="cs-stat tabular-nums">{outCount}</p>
          <ColorChip tone="blue">퇴근</ColorChip>
        </div>
        <div className="flex items-end gap-2">
          <p className="cs-stat tabular-nums">{absentCount}</p>
          <ColorChip tone="red">미출근</ColorChip>
        </div>
      </div>

      {error && <p className="text-destructive text-sm">불러오지 못했습니다.</p>}
      {isLoading && !data && <p className="text-muted-foreground text-sm">불러오는 중…</p>}

      {data && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">이름</th>
                <th className="px-3 py-2.5 text-left font-medium">상태</th>
                <th className="px-3 py-2.5 text-left font-medium">출근</th>
                <th className="px-3 py-2.5 text-left font-medium">퇴근</th>
                <th className="px-3 py-2.5 text-left font-medium">근무시간</th>
                <th className="px-3 py-2.5 text-left font-medium">자리 비움</th>
              </tr>
            </thead>
            <tbody>
              {members.map((row) => {
                const chip = statusChip(row.status);
                return (
                  <tr key={row.userId} className="border-t">
                    <td className="px-3 py-3">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {[row.department, row.position].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <ColorChip tone={chip.tone}>{chip.label}</ColorChip>
                    </td>
                    <td className="px-3 py-3 text-lg font-semibold tabular-nums text-emerald-700">
                      {row.checkIn ? formatKstHm(row.checkIn) : "—"}
                    </td>
                    <td className="px-3 py-3 text-lg font-semibold tabular-nums text-rose-700">
                      {row.checkOut ? formatKstHm(row.checkOut) : "—"}
                    </td>
                    <td className="px-3 py-3 text-lg font-semibold tabular-nums">
                      {row.workedMs == null ? "—" : formatDurationMinutes(row.workedMs)}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-sky-800">
                      {row.awayMs > 0 ? formatDurationMinutes(row.awayMs) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
