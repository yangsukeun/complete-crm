import { describe, expect, it } from "vitest";
import {
  canMutateSchedule,
  canViewSchedule,
  csUserIdsFrom,
  filterScheduleInviteeIds,
  isCsSchedulerMember,
  sameScheduleSharePool,
  teamScheduleWhere,
} from "@/lib/schedule-team-access";

const csIds = ["cs1", "cs2"];

describe("isCsSchedulerMember", () => {
  it("includes CS / CS팀 staff, excludes executives and HQ", () => {
    expect(isCsSchedulerMember({ department: "CS팀", role: "USER" })).toBe(true);
    expect(isCsSchedulerMember({ department: "CS", role: "TEAM_LEAD" })).toBe(true);
    expect(isCsSchedulerMember({ department: "CS팀", role: "EXECUTIVE" })).toBe(false);
    expect(isCsSchedulerMember({ department: "마케팅", role: "USER" })).toBe(false);
  });
});

describe("teamScheduleWhere", () => {
  it("CS viewer sees all CS TEAM schedules", () => {
    expect(teamScheduleWhere({ id: "cs1", role: "USER", department: "CS팀" }, csIds)).toEqual({
      scope: "TEAM",
      userId: { in: csIds },
    });
  });

  it("HQ admin does not see CS TEAM schedules", () => {
    expect(teamScheduleWhere({ id: "adm", role: "EXECUTIVE", department: "경영지원" }, csIds)).toEqual({
      scope: "TEAM",
      userId: { notIn: csIds },
    });
  });

  it("HQ staff still sees only own TEAM schedules", () => {
    expect(teamScheduleWhere({ id: "hq1", role: "USER", department: "마케팅" }, csIds)).toEqual({
      scope: "TEAM",
      userId: "hq1",
    });
  });
});

describe("canViewSchedule / canMutateSchedule", () => {
  const csViewer = { id: "cs1", role: "USER", department: "CS팀" };
  const hqAdmin = { id: "adm", role: "ADMIN", department: "경영지원" };

  it("lets CS members view each other TEAM events, not HQ admin", () => {
    expect(
      canViewSchedule({
        viewer: csViewer,
        scheduleUserId: "cs2",
        scheduleScope: "TEAM",
        ownerIsCsScheduler: true,
      }),
    ).toBe(true);
    expect(
      canViewSchedule({
        viewer: hqAdmin,
        scheduleUserId: "cs2",
        scheduleScope: "TEAM",
        ownerIsCsScheduler: true,
      }),
    ).toBe(false);
  });

  it("does not let HQ admin mutate CS schedules", () => {
    expect(
      canMutateSchedule({ viewer: hqAdmin, scheduleUserId: "cs2", ownerIsCsScheduler: true }),
    ).toBe(false);
    expect(
      canMutateSchedule({ viewer: csViewer, scheduleUserId: "cs1", ownerIsCsScheduler: true }),
    ).toBe(true);
  });
});

describe("filterScheduleInviteeIds", () => {
  it("keeps CS invites inside CS", () => {
    expect(
      filterScheduleInviteeIds({ id: "cs1", role: "USER", department: "CS팀" }, ["cs2", "hq1"], csIds),
    ).toEqual(["cs2"]);
    expect(
      filterScheduleInviteeIds({ id: "hq1", role: "USER", department: "마케팅" }, ["cs2", "hq2"], csIds),
    ).toEqual(["hq2"]);
  });
});

describe("sameScheduleSharePool", () => {
  it("keeps CS with CS and HQ with HQ", () => {
    expect(sameScheduleSharePool("cs1", "cs2", csIds)).toBe(true);
    expect(sameScheduleSharePool("hq1", "hq2", csIds)).toBe(true);
    expect(sameScheduleSharePool("cs1", "hq1", csIds)).toBe(false);
  });
});

describe("csUserIdsFrom", () => {
  it("picks CS staff ids", () => {
    expect(
      csUserIdsFrom([
        { id: "a", department: "CS팀", role: "USER" },
        { id: "b", department: "마케팅", role: "USER" },
        { id: "c", department: "CS", role: "EXECUTIVE" },
      ]),
    ).toEqual(["a"]);
  });
});
