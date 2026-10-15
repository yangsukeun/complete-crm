import { describe, expect, it } from "vitest";
import {
  canViewOthersDailyWorkLog,
  getWorkLogViewCaps,
  hasDailyReportMenuAccess,
} from "@/lib/work-log-access";
import { getDefaultPermissionsForRole } from "@/lib/permissions";

const staffOnly = JSON.stringify(["work_log_view_staff"]);
const leadOnly = JSON.stringify(["work_log_view_lead"]);
const staffAndOther = JSON.stringify(["work_log_view_staff", "work_log_view_other_dept"]);
const leadAndOther = JSON.stringify(["work_log_view_lead", "work_log_view_other_dept"]);
const allThree = JSON.stringify([
  "work_log_view_staff",
  "work_log_view_lead",
  "work_log_view_other_dept",
]);
const legacyLogs = JSON.stringify(["admin_logs"]);

const viewer = {
  viewerId: "me",
  viewerRole: "USER",
  viewerDepartment: "마케팅",
};

describe("work-log view caps", () => {
  it("같은 부서라도 기본(팀장 포함)은 타인 일지를 못 본다", () => {
    expect(hasDailyReportMenuAccess({ role: "TEAM_LEAD", permissions: null })).toBe(false);
    expect(getDefaultPermissionsForRole("TEAM_LEAD")).not.toContain("admin_logs");
    expect(getDefaultPermissionsForRole("TEAM_LEAD")).not.toContain("work_log_view_staff");
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerRole: "TEAM_LEAD",
        viewerPermissions: null,
        target: { id: "u1", role: "USER", department: "마케팅" },
      })
    ).toBe(false);
  });

  it("사원급 권한만 있으면 같은 팀 사원만 본다", () => {
    expect(hasDailyReportMenuAccess({ role: "USER", permissions: staffOnly })).toBe(true);
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: staffOnly,
        target: { id: "u1", role: "USER", department: "마케팅" },
      })
    ).toBe(true);
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: staffOnly,
        target: { id: "l1", role: "TEAM_LEAD", department: "마케팅" },
      })
    ).toBe(false);
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: staffOnly,
        target: { id: "u2", role: "USER", department: "CS팀" },
      })
    ).toBe(false);
  });

  it("팀장급 권한만 있으면 같은 팀 팀장·센터장만 본다", () => {
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: leadOnly,
        target: { id: "l1", role: "TEAM_LEAD", department: "마케팅" },
      })
    ).toBe(true);
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: leadOnly,
        target: { id: "c1", role: "CENTER_CHIEF", department: "마케팅" },
      })
    ).toBe(true);
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: leadOnly,
        target: { id: "u1", role: "USER", department: "마케팅" },
      })
    ).toBe(false);
  });

  it("사원급+다른 부서면 다른 팀 사원을 본다", () => {
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: staffAndOther,
        target: { id: "u2", role: "USER", department: "CS팀" },
      })
    ).toBe(true);
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: staffAndOther,
        target: { id: "l2", role: "TEAM_LEAD", department: "CS팀" },
      })
    ).toBe(false);
  });

  it("팀장급+다른 부서면 다른 팀 팀장만 본다", () => {
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: leadAndOther,
        target: { id: "l2", role: "TEAM_LEAD", department: "CS팀" },
      })
    ).toBe(true);
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: leadAndOther,
        target: { id: "u2", role: "USER", department: "CS팀" },
      })
    ).toBe(false);
  });

  it("세 권한을 병렬로 주면 사원·팀장·다른 팀을 모두 본다", () => {
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: allThree,
        target: { id: "u2", role: "USER", department: "CS팀" },
      })
    ).toBe(true);
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: allThree,
        target: { id: "l2", role: "TEAM_LEAD", department: "CS팀" },
      })
    ).toBe(true);
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: allThree,
        target: { id: "boss", role: "EXECUTIVE", department: "경영지원" },
      })
    ).toBe(false);
  });

  it("대표는 전부, 구 admin_logs 는 사원급(같은 부서)으로 취급", () => {
    expect(getWorkLogViewCaps({ role: "EXECUTIVE", permissions: null })).toEqual({
      staff: true,
      lead: true,
      otherDept: true,
    });
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: legacyLogs,
        target: { id: "u1", role: "USER", department: "마케팅" },
      })
    ).toBe(true);
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: legacyLogs,
        target: { id: "u2", role: "USER", department: "CS팀" },
      })
    ).toBe(false);
  });

  it("본인 일지는 권한 없이 볼 수 있다", () => {
    expect(
      canViewOthersDailyWorkLog({
        ...viewer,
        viewerPermissions: JSON.stringify(["profile"]),
        target: { id: "me", role: "USER", department: "마케팅" },
      })
    ).toBe(true);
  });
});
