import { describe, expect, it } from "vitest";
import { addDaysKstYmd } from "@/lib/date-kst";
import {
  buildIdleCurrent,
  buildIdleLiveStatus,
  classifyIdlePresence,
  clipIdleToWorkHours,
  groupIdleDailySummary,
  groupIdleWeekMonth,
  matchIdleEmployee,
  mondayYmdKst,
} from "@/lib/attendance-idle";

describe("classifyIdlePresence", () => {
  const now = new Date("2026-08-19T05:00:00.000Z");

  it("is online when lastSeen is within 180s and not idle", () => {
    expect(classifyIdlePresence(new Date("2026-08-19T04:59:00.000Z"), false, now)).toBe("online");
  });

  it("is idle when lastSeen is within 180s and isIdle", () => {
    expect(classifyIdlePresence(new Date("2026-08-19T04:57:30.000Z"), true, now)).toBe("idle");
  });

  it("is offline when lastSeen is older than 180s", () => {
    expect(classifyIdlePresence(new Date("2026-08-19T04:56:59.000Z"), false, now)).toBe("offline");
    expect(classifyIdlePresence(new Date("2026-08-19T04:56:59.000Z"), true, now)).toBe("offline");
  });

  it("is stopped when the client reported stopped, even if recently seen", () => {
    expect(classifyIdlePresence(now, true, now, 180_000, "stopped")).toBe("stopped");
    expect(classifyIdlePresence(now, false, now, 180_000, "stopped")).toBe("stopped");
  });
});

describe("buildIdleLiveStatus", () => {
  it("keeps the newest device per employee", () => {
    const now = new Date("2026-08-19T05:00:00.000Z");
    const rows = buildIdleLiveStatus(
      [
        { employeeId: "a", lastSeen: new Date("2026-08-19T04:59:50.000Z"), isIdle: true },
        { employeeId: "a", lastSeen: new Date("2026-08-19T04:59:55.000Z"), isIdle: false },
        { employeeId: "b", lastSeen: new Date("2026-08-19T04:50:00.000Z"), isIdle: false },
      ],
      now
    );
    expect(rows).toEqual([
      { employeeId: "a", status: "online", lastSeen: "2026-08-19T04:59:55.000Z" },
      { employeeId: "b", status: "offline", lastSeen: "2026-08-19T04:50:00.000Z" },
    ]);
  });

  it("marks tray-stopped clients as stopped, not offline", () => {
    const now = new Date("2026-08-19T05:00:00.000Z");
    const rows = buildIdleLiveStatus(
      [
        {
          employeeId: "a",
          lastSeen: new Date("2026-08-19T04:59:55.000Z"),
          isIdle: false,
          status: "stopped",
        },
      ],
      now
    );
    expect(rows).toEqual([
      { employeeId: "a", status: "stopped", lastSeen: "2026-08-19T04:59:55.000Z" },
    ]);
  });
});

describe("buildIdleCurrent", () => {
  it("lists idle employees with elapsed time from lastSeen", () => {
    const now = new Date("2026-08-19T05:00:00.000Z");
    const current = buildIdleCurrent(
      [
        {
          employeeId: "a",
          lastSeen: new Date("2026-08-19T04:50:00.000Z"),
          updatedAt: new Date("2026-08-19T04:59:50.000Z"),
          isIdle: true,
        },
        {
          employeeId: "b",
          lastSeen: new Date("2026-08-19T04:59:50.000Z"),
          isIdle: false,
        },
      ],
      now,
      new Map([["a", { name: "김자동", department: "CS팀", birthdayToday: false }]])
    );
    expect(current).toHaveLength(1);
    expect(current[0]?.name).toBe("김자동");
    expect(current[0]?.elapsedMs).toBe(10 * 60 * 1000);
    expect(current[0]?.startedAt).toBe("2026-08-19T04:50:00.000Z");
  });

  it("does not list tray-stopped clients as currently idle", () => {
    const now = new Date("2026-08-19T05:00:00.000Z");
    const current = buildIdleCurrent(
      [
        {
          employeeId: "a",
          lastSeen: new Date("2026-08-19T04:50:00.000Z"),
          updatedAt: new Date("2026-08-19T04:59:50.000Z"),
          isIdle: true,
          status: "stopped",
        },
      ],
      now
    );
    expect(current).toHaveLength(0);
  });
});

describe("groupIdleDailySummary", () => {
  it("sums duration and lists sessions newest first", () => {
    const summary = groupIdleDailySummary([
      {
        employeeId: "a",
        idleStart: new Date("2026-08-19T01:00:00.000Z"),
        idleEnd: new Date("2026-08-19T01:05:00.000Z"),
        durationSeconds: 300,
      },
      {
        employeeId: "a",
        idleStart: new Date("2026-08-19T02:00:00.000Z"),
        idleEnd: new Date("2026-08-19T02:01:00.000Z"),
        durationSeconds: 60,
      },
    ]);
    expect(summary).toHaveLength(1);
    expect(summary[0]?.totalDurationSeconds).toBe(360);
    expect(summary[0]?.sessionCount).toBe(2);
    expect(summary[0]?.sessions[0]?.idleStart).toBe("2026-08-19T02:00:00.000Z");
  });
});

describe("mondayYmdKst / groupIdleWeekMonth", () => {
  it("uses Monday as the KST week start", () => {
    expect(mondayYmdKst("2026-08-19")).toBe("2026-08-17");
    expect(mondayYmdKst("2026-08-16")).toBe("2026-08-10");
  });

  it("splits sessions into weekday / week / month totals like away overview", () => {
    const today = "2026-08-19";
    const weekStart = mondayYmdKst(today);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDaysKstYmd(weekStart, i));
    const people = new Map([
      ["a", { name: "김자동", department: "CS팀", birthdayToday: false }],
    ]);
    const totals = groupIdleWeekMonth({
      today,
      weekStart,
      weekDays,
      now: new Date("2026-08-19T05:00:00.000Z"),
      people,
      sessions: [
        {
          id: "prev-week",
          employeeId: "a",
          idleStart: new Date("2026-08-03T10:00:00+09:00"),
          idleEnd: new Date("2026-08-03T10:02:00+09:00"),
          durationSeconds: 120,
        },
        {
          id: "tue",
          employeeId: "a",
          idleStart: new Date("2026-08-18T10:00:00+09:00"),
          idleEnd: new Date("2026-08-18T10:05:00+09:00"),
          durationSeconds: 300,
        },
        {
          id: "today",
          employeeId: "a",
          idleStart: new Date("2026-08-19T11:00:00+09:00"),
          idleEnd: new Date("2026-08-19T11:01:00+09:00"),
          durationSeconds: 60,
        },
      ],
    });

    expect(totals).toHaveLength(1);
    const row = totals[0]!;
    expect(row.name).toBe("김자동");
    expect(row.month).toEqual({ count: 3, durationMs: 480_000 });
    expect(row.week).toEqual({ count: 2, durationMs: 360_000 });
    expect(row.today).toEqual({ count: 1, durationMs: 60_000 });
    expect(row.byYmd["2026-08-18"]).toEqual({ count: 1, durationMs: 300_000 });
    expect(row.byYmd["2026-08-19"]).toEqual({ count: 1, durationMs: 60_000 });
    expect(row.sessions[0]?.id).toBe("today");
  });
});

describe("clipIdleToWorkHours / work-hour filtered totals", () => {
  const today = "2026-08-19";
  const weekStart = mondayYmdKst(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysKstYmd(weekStart, i));

  function totalsFor(
    sessions: Array<{
      id: string;
      employeeId: string;
      idleStart: Date;
      idleEnd: Date;
      durationSeconds: number;
    }>,
    allDayEmployeeIds?: ReadonlySet<string>
  ) {
    return groupIdleWeekMonth({
      today,
      weekStart,
      weekDays,
      now: new Date("2026-08-19T05:00:00.000Z"),
      sessions,
      allDayEmployeeIds,
    });
  }

  it("excludes idle time outside work hours", () => {
    const clip = clipIdleToWorkHours(
      new Date("2026-08-19T20:00:00+09:00"),
      new Date("2026-08-19T20:10:00+09:00")
    );
    expect(clip.totalMs).toBe(0);
    const totals = totalsFor([
      {
        id: "night",
        employeeId: "a",
        idleStart: new Date("2026-08-19T20:00:00+09:00"),
        idleEnd: new Date("2026-08-19T20:10:00+09:00"),
        durationSeconds: 600,
      },
    ]);
    expect(totals).toHaveLength(0);
  });

  it("excludes lunch-hour idle", () => {
    const clip = clipIdleToWorkHours(
      new Date("2026-08-19T12:10:00+09:00"),
      new Date("2026-08-19T12:40:00+09:00")
    );
    expect(clip.totalMs).toBe(0);
    const totals = totalsFor([
      {
        id: "lunch",
        employeeId: "a",
        idleStart: new Date("2026-08-19T12:10:00+09:00"),
        idleEnd: new Date("2026-08-19T12:40:00+09:00"),
        durationSeconds: 1800,
      },
    ]);
    expect(totals).toHaveLength(0);
  });

  it("clips a session that crosses a work-hour boundary", () => {
    const clip = clipIdleToWorkHours(
      new Date("2026-08-19T11:50:00+09:00"),
      new Date("2026-08-19T12:20:00+09:00")
    );
    expect(clip.totalMs).toBe(10 * 60 * 1000);
    expect(clip.byYmd["2026-08-19"]).toBe(10 * 60 * 1000);

    const acrossLunch = clipIdleToWorkHours(
      new Date("2026-08-19T11:50:00+09:00"),
      new Date("2026-08-19T13:10:00+09:00")
    );
    expect(acrossLunch.totalMs).toBe(20 * 60 * 1000);

    const totals = totalsFor([
      {
        id: "edge",
        employeeId: "a",
        idleStart: new Date("2026-08-19T11:50:00+09:00"),
        idleEnd: new Date("2026-08-19T12:20:00+09:00"),
        durationSeconds: 1800,
      },
    ]);
    expect(totals).toHaveLength(1);
    expect(totals[0]?.today).toEqual({ count: 1, durationMs: 10 * 60 * 1000 });
    expect(totals[0]?.sessions).toHaveLength(1);
    expect(totals[0]?.sessions[0]?.durationMs).toBe(10 * 60 * 1000);
  });

  it("sums the full day for 24-hour exception employees", () => {
    const night = {
      id: "night",
      employeeId: "a",
      idleStart: new Date("2026-08-19T20:00:00+09:00"),
      idleEnd: new Date("2026-08-19T20:10:00+09:00"),
      durationSeconds: 600,
    };
    const lunch = {
      id: "lunch",
      employeeId: "a",
      idleStart: new Date("2026-08-19T12:10:00+09:00"),
      idleEnd: new Date("2026-08-19T12:40:00+09:00"),
      durationSeconds: 1800,
    };
    const filtered = totalsFor([night, lunch]);
    expect(filtered).toHaveLength(0);

    const allDay = totalsFor([night, lunch], new Set(["a"]));
    expect(allDay).toHaveLength(1);
    expect(allDay[0]?.today).toEqual({ count: 2, durationMs: 40 * 60 * 1000 });
    expect(allDay[0]?.sessions).toHaveLength(2);
  });
});

describe("matchIdleEmployee", () => {
  const users = [
    { id: "cuid1", name: "양숙은", email: "yangsukeun@cpcrm.co.kr" },
    { id: "cuid2", name: "김자동", email: "auto@cpcrm.co.kr" },
  ];

  it("matches by email local-part or exact name/id", () => {
    expect(matchIdleEmployee("yangsukeun", users)?.name).toBe("양숙은");
    expect(matchIdleEmployee("김자동", users)?.id).toBe("cuid2");
    expect(matchIdleEmployee("cuid1", users)?.email).toBe("yangsukeun@cpcrm.co.kr");
    expect(matchIdleEmployee("nobody", users)).toBeUndefined();
  });
});
