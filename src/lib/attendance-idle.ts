import {
  addDaysKstYmd,
  eachKstYmdInclusive,
  getKstWeekday,
  kstDateBoundsUtc,
  toKstYmd,
} from "@/lib/date-kst";

export const IDLE_LIVE_WINDOW_MS = 180_000;

export type IdleLiveStatus = "online" | "idle" | "offline" | "stopped";

export type IdleClientStatus = "running" | "stopped";

export type IdleDeviceRow = {
  employeeId: string;
  lastSeen: Date;
  isIdle: boolean;
  status?: string | null;
  updatedAt?: Date;
};

export type IdleSessionRow = {
  employeeId: string;
  idleStart: Date;
  idleEnd: Date;
  durationSeconds: number;
};

export type IdleTotals = {
  count: number;
  durationMs: number;
};

export type IdleOverviewSession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  ymd: string;
};

export type IdlePersonMeta = {
  name: string;
  department: string | null;
  birthdayToday: boolean;
};

export type IdleOverviewPerson = {
  userId: string;
  name: string;
  department: string | null;
  birthdayToday: boolean;
  today: IdleTotals;
  week: IdleTotals;
  month: IdleTotals;
  byYmd: Record<string, IdleTotals>;
  sessions: IdleOverviewSession[];
};

export function mondayYmdKst(ymd: string): string {
  const wd = getKstWeekday(new Date(`${ymd}T12:00:00+09:00`));
  const offset = wd === 0 ? -6 : 1 - wd;
  return addDaysKstYmd(ymd, offset);
}

export function monthStartYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function normalizeIdleClientStatus(value: unknown): IdleClientStatus {
  return value === "stopped" ? "stopped" : "running";
}

export function classifyIdlePresence(
  lastHeartbeat: Date,
  isIdle: boolean,
  now: Date,
  windowMs = IDLE_LIVE_WINDOW_MS,
  clientStatus?: string | null
): IdleLiveStatus {
  if (normalizeIdleClientStatus(clientStatus) === "stopped") return "stopped";
  const age = now.getTime() - lastHeartbeat.getTime();
  if (age > windowMs) return "offline";
  return isIdle ? "idle" : "online";
}

function heartbeatAt(row: IdleDeviceRow): Date {
  return row.updatedAt ?? row.lastSeen;
}

/** 직원당 하트비트가 가장 최근인 기기 한 대로 현재 상태를 고른다. */
export function buildIdleLiveStatus(
  rows: IdleDeviceRow[],
  now: Date,
  windowMs = IDLE_LIVE_WINDOW_MS
): { employeeId: string; status: IdleLiveStatus; lastSeen: string }[] {
  const latest = new Map<string, IdleDeviceRow>();
  for (const row of rows) {
    const prev = latest.get(row.employeeId);
    if (!prev || heartbeatAt(row).getTime() > heartbeatAt(prev).getTime()) {
      latest.set(row.employeeId, row);
    }
  }
  return [...latest.values()]
    .map((row) => ({
      employeeId: row.employeeId,
      status: classifyIdlePresence(heartbeatAt(row), row.isIdle, now, windowMs, row.status),
      lastSeen: row.lastSeen.toISOString(),
    }))
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}

/** 지금 이석 중인 직원 — lastSeen을 이석 시작으로 보고 경과를 계산한다. */
export function buildIdleCurrent(
  rows: IdleDeviceRow[],
  now: Date,
  people?: Map<string, IdlePersonMeta>,
  windowMs = IDLE_LIVE_WINDOW_MS
): {
  id: string;
  userId: string;
  name: string;
  department: string | null;
  startedAt: string;
  elapsedMs: number;
  birthdayToday: boolean;
}[] {
  const latest = new Map<string, IdleDeviceRow>();
  for (const row of rows) {
    const prev = latest.get(row.employeeId);
    if (!prev || heartbeatAt(row).getTime() > heartbeatAt(prev).getTime()) {
      latest.set(row.employeeId, row);
    }
  }
  return [...latest.values()]
    .filter((row) => classifyIdlePresence(heartbeatAt(row), row.isIdle, now, windowMs, row.status) === "idle")
    .map((row) => {
      const meta = people?.get(row.employeeId);
      return {
        id: row.employeeId,
        userId: row.employeeId,
        name: meta?.name ?? row.employeeId,
        department: meta?.department ?? null,
        startedAt: row.lastSeen.toISOString(),
        elapsedMs: Math.max(0, now.getTime() - row.lastSeen.getTime()),
        birthdayToday: meta?.birthdayToday ?? false,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function matchIdleEmployee<T extends { id: string; name: string; email: string }>(
  employeeId: string,
  users: T[]
): T | undefined {
  const needle = employeeId.trim().toLowerCase();
  return (
    users.find((u) => u.id === employeeId) ??
    users.find((u) => u.email.toLowerCase().startsWith(`${needle}@`)) ??
    users.find((u) => u.name === employeeId)
  );
}

function emptyTotals(): IdleTotals {
  return { count: 0, durationMs: 0 };
}

function addLog(t: IdleTotals, ms: number) {
  t.count += 1;
  t.durationMs += ms;
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** 기본 근무시간(KST): 09:00~12:00, 13:00~18:00. 끝 시각은 포함하지 않는다. */
export const IDLE_WORK_WINDOWS_KST = [
  { start: "09:00", end: "12:00" },
  { start: "13:00", end: "18:00" },
] as const;

export type IdleClipResult = {
  totalMs: number;
  byYmd: Record<string, number>;
};

/**
 * 이석 구간을 근무시간에 맞춰 자른다. allDay면 점심·야간도 그대로 둔다.
 * idle_sessions 원본은 바꾸지 않고, 화면 집계용 밀리초만 계산한다.
 */
export function clipIdleToWorkHours(
  idleStart: Date,
  idleEnd: Date,
  opts?: { allDay?: boolean }
): IdleClipResult {
  const start = idleStart.getTime();
  const end = idleEnd.getTime();
  if (!(end > start)) return { totalMs: 0, byYmd: {} };

  const ymds = eachKstYmdInclusive(idleStart, idleEnd);
  const byYmd: Record<string, number> = {};
  let totalMs = 0;
  for (const ymd of ymds) {
    const windows = opts?.allDay
      ? [kstDateBoundsUtc(ymd)]
      : IDLE_WORK_WINDOWS_KST.map((w) => ({
          start: new Date(`${ymd}T${w.start}:00+09:00`),
          end: new Date(`${ymd}T${w.end}:00+09:00`),
        }));
    let dayMs = 0;
    for (const w of windows) {
      dayMs += overlapMs(start, end, w.start.getTime(), w.end.getTime());
    }
    if (dayMs > 0) {
      byYmd[ymd] = dayMs;
      totalMs += dayMs;
    }
  }
  return { totalMs, byYmd };
}

function ymdInWeek(ymd: string, weekStart: string): boolean {
  const weekEnd = addDaysKstYmd(weekStart, 7);
  return ymd >= weekStart && ymd < weekEnd;
}

function sumByYmd(byYmd: Record<string, number>, pred: (ymd: string) => boolean): number {
  let total = 0;
  for (const [ymd, ms] of Object.entries(byYmd)) {
    if (pred(ymd)) total += ms;
  }
  return total;
}

/** 셀프 자리비움 overview와 같은 직원·요일·주·월 집계. */
export function groupIdleWeekMonth(opts: {
  sessions: Array<{
    id: string;
    employeeId: string;
    idleStart: Date;
    idleEnd: Date;
    durationSeconds: number;
  }>;
  now: Date;
  today: string;
  weekStart: string;
  weekDays: string[];
  people?: Map<string, IdlePersonMeta>;
  /** 24시간 근무로 지정된 세션 employeeId (근무시간 필터 생략) */
  allDayEmployeeIds?: ReadonlySet<string>;
}): IdleOverviewPerson[] {
  const byUser = new Map<string, IdleOverviewPerson>();
  const ensure = (employeeId: string) => {
    let row = byUser.get(employeeId);
    if (!row) {
      const meta = opts.people?.get(employeeId);
      row = {
        userId: employeeId,
        name: meta?.name ?? employeeId,
        department: meta?.department ?? null,
        birthdayToday: meta?.birthdayToday ?? false,
        today: emptyTotals(),
        week: emptyTotals(),
        month: emptyTotals(),
        byYmd: Object.fromEntries(opts.weekDays.map((d) => [d, emptyTotals()])),
        sessions: [],
      };
      byUser.set(employeeId, row);
    }
    return row;
  };

  for (const row of opts.sessions) {
    const allDay = opts.allDayEmployeeIds?.has(row.employeeId) ?? false;
    const clip = clipIdleToWorkHours(row.idleStart, row.idleEnd, { allDay });
    if (clip.totalMs <= 0) continue;

    const ymd = toKstYmd(row.idleStart);
    const agg = ensure(row.employeeId);
    agg.sessions.push({
      id: row.id,
      startedAt: row.idleStart.toISOString(),
      endedAt: row.idleEnd.toISOString(),
      durationMs: clip.totalMs,
      ymd,
    });
    addLog(agg.month, clip.totalMs);
    const weekMs = sumByYmd(clip.byYmd, (d) => ymdInWeek(d, opts.weekStart));
    if (weekMs > 0) addLog(agg.week, weekMs);
    const todayMs = clip.byYmd[opts.today] ?? 0;
    if (todayMs > 0) addLog(agg.today, todayMs);
    for (const [day, ms] of Object.entries(clip.byYmd)) {
      if (!agg.byYmd[day]) agg.byYmd[day] = emptyTotals();
      addLog(agg.byYmd[day], ms);
    }
  }

  return [...byUser.values()]
    .map((row) => ({
      ...row,
      sessions: row.sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function groupIdleDailySummary(rows: IdleSessionRow[]): {
  employeeId: string;
  totalDurationSeconds: number;
  sessionCount: number;
  sessions: { idleStart: string; idleEnd: string; durationSeconds: number }[];
}[] {
  const byEmp = new Map<
    string,
    {
      employeeId: string;
      totalDurationSeconds: number;
      sessionCount: number;
      sessions: { idleStart: string; idleEnd: string; durationSeconds: number }[];
    }
  >();
  for (const row of rows) {
    let agg = byEmp.get(row.employeeId);
    if (!agg) {
      agg = { employeeId: row.employeeId, totalDurationSeconds: 0, sessionCount: 0, sessions: [] };
      byEmp.set(row.employeeId, agg);
    }
    const durationSeconds = Math.max(0, Math.trunc(Number(row.durationSeconds) || 0));
    agg.totalDurationSeconds += durationSeconds;
    agg.sessionCount += 1;
    agg.sessions.push({
      idleStart: row.idleStart.toISOString(),
      idleEnd: row.idleEnd.toISOString(),
      durationSeconds,
    });
  }
  return [...byEmp.values()]
    .map((row) => ({
      ...row,
      sessions: row.sessions.sort((a, b) => b.idleStart.localeCompare(a.idleStart)),
    }))
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}
