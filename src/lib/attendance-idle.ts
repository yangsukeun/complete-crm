import {
  addDaysKstYmd,
  getKstWeekday,
  kstDateBoundsUtc,
  kstYmdToUtcDayStart,
  toKstYmd,
} from "@/lib/date-kst";

export const IDLE_LIVE_WINDOW_MS = 180_000;

export type IdleLiveStatus = "online" | "idle" | "offline";

export type IdleDeviceRow = {
  employeeId: string;
  lastSeen: Date;
  isIdle: boolean;
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

export function classifyIdlePresence(
  lastHeartbeat: Date,
  isIdle: boolean,
  now: Date,
  windowMs = IDLE_LIVE_WINDOW_MS
): IdleLiveStatus {
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
      status: classifyIdlePresence(heartbeatAt(row), row.isIdle, now, windowMs),
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
    .filter((row) => classifyIdlePresence(heartbeatAt(row), row.isIdle, now, windowMs) === "idle")
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

function sessionDurationMs(row: {
  idleStart: Date;
  idleEnd: Date;
  durationSeconds: number;
}): number {
  const fromSec = Math.max(0, Math.trunc(Number(row.durationSeconds) || 0)) * 1000;
  if (fromSec > 0) return fromSec;
  return Math.max(0, row.idleEnd.getTime() - row.idleStart.getTime());
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
}): IdleOverviewPerson[] {
  const todayStart = kstDateBoundsUtc(opts.today).start.getTime();
  const weekStartMs = kstYmdToUtcDayStart(opts.weekStart).getTime();

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
    const ms = sessionDurationMs(row);
    const startMs = row.idleStart.getTime();
    const ymd = toKstYmd(row.idleStart);
    const agg = ensure(row.employeeId);
    agg.sessions.push({
      id: row.id,
      startedAt: row.idleStart.toISOString(),
      endedAt: row.idleEnd.toISOString(),
      durationMs: ms,
      ymd,
    });
    addLog(agg.month, ms);
    if (startMs >= weekStartMs) addLog(agg.week, ms);
    if (startMs >= todayStart) addLog(agg.today, ms);
    if (!agg.byYmd[ymd]) agg.byYmd[ymd] = emptyTotals();
    addLog(agg.byYmd[ymd], ms);
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
