import { describe, expect, it } from "vitest";
import {
  buildIdleLiveStatus,
  classifyIdlePresence,
  groupIdleDailySummary,
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
