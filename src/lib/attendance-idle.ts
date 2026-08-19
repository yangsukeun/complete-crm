export const IDLE_LIVE_WINDOW_MS = 180_000;

export type IdleLiveStatus = "online" | "idle" | "offline";

export type IdleDeviceRow = {
  employeeId: string;
  lastSeen: Date;
  isIdle: boolean;
};

export type IdleSessionRow = {
  employeeId: string;
  idleStart: Date;
  idleEnd: Date;
  durationSeconds: number;
};

export function classifyIdlePresence(
  lastSeen: Date,
  isIdle: boolean,
  now: Date,
  windowMs = IDLE_LIVE_WINDOW_MS
): IdleLiveStatus {
  const age = now.getTime() - lastSeen.getTime();
  if (age > windowMs) return "offline";
  return isIdle ? "idle" : "online";
}

/** 직원당 lastSeen이 가장 최근인 기기 한 대로 현재 상태를 고른다. */
export function buildIdleLiveStatus(
  rows: IdleDeviceRow[],
  now: Date,
  windowMs = IDLE_LIVE_WINDOW_MS
): { employeeId: string; status: IdleLiveStatus; lastSeen: string }[] {
  const latest = new Map<string, IdleDeviceRow>();
  for (const row of rows) {
    const prev = latest.get(row.employeeId);
    if (!prev || row.lastSeen.getTime() > prev.lastSeen.getTime()) {
      latest.set(row.employeeId, row);
    }
  }
  return [...latest.values()]
    .map((row) => ({
      employeeId: row.employeeId,
      status: classifyIdlePresence(row.lastSeen, row.isIdle, now, windowMs),
      lastSeen: row.lastSeen.toISOString(),
    }))
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
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
