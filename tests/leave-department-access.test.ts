import { describe, expect, it } from "vitest";
import {
  canTeamLeadManageLeaveApplicant,
  canFirstApproveLeave,
  teamLeadNotifyWhereForApplicantDepartment,
} from "@/lib/leave-department-access";
import { leaveRequestListWhere } from "@/lib/leave-request-serialize";

import {
  departmentHasTeamLead,
  needsExecutiveDirectLeaveApproval,
  applicantSkipsTeamLeadLeaveStep,
  canExecutiveFinalApproveLeave,
} from "@/lib/leave-department-access";

describe("leave-department-access", () => {
  it("allows team lead only for same department", () => {
    expect(canTeamLeadManageLeaveApplicant("마케팅", "마케팅")).toBe(true);
    expect(canTeamLeadManageLeaveApplicant("마케팅", "경영지원")).toBe(false);
    expect(canTeamLeadManageLeaveApplicant("  마케팅 ", "마케팅")).toBe(true);
    expect(canTeamLeadManageLeaveApplicant(null, "마케팅")).toBe(false);
    expect(canTeamLeadManageLeaveApplicant("마케팅", null)).toBe(false);
  });

  it("builds team lead notify filter from applicant department", () => {
    expect(teamLeadNotifyWhereForApplicantDepartment("경영지원")).toEqual({
      role: "TEAM_LEAD",
      department: "경영지원",
    });
    expect(teamLeadNotifyWhereForApplicantDepartment("  ")).toBeNull();
  });

  it("notifies CS team lead and center chief together", () => {
    expect(teamLeadNotifyWhereForApplicantDepartment("CS팀")).toEqual({
      department: "CS팀",
      role: { in: ["TEAM_LEAD", "CENTER_CHIEF"] },
    });
  });

  it("lets CS center chief first-approve same department only", () => {
    expect(
      canFirstApproveLeave({
        viewerRole: "CENTER_CHIEF",
        viewerDepartment: "CS팀",
        applicantDepartment: "CS팀",
      })
    ).toBe(true);
    expect(
      canFirstApproveLeave({
        viewerRole: "CENTER_CHIEF",
        viewerDepartment: "마케팅",
        applicantDepartment: "마케팅",
      })
    ).toBe(false);
    expect(
      canFirstApproveLeave({
        viewerRole: "TEAM_LEAD",
        viewerDepartment: "마케팅",
        applicantDepartment: "마케팅",
      })
    ).toBe(true);
    expect(
      canFirstApproveLeave({
        viewerRole: "TEAM_LEAD",
        viewerDepartment: "물류",
        applicantDepartment: "마케팅",
      })
    ).toBe(false);
  });

  it("detects departments with team lead and executive direct approval", () => {
    const withLead = new Set(["마케팅", "개발"]);
    expect(departmentHasTeamLead("마케팅", withLead)).toBe(true);
    expect(departmentHasTeamLead("경영지원", withLead)).toBe(false);
    expect(needsExecutiveDirectLeaveApproval("경영지원", withLead)).toBe(true);
    expect(needsExecutiveDirectLeaveApproval("마케팅", withLead)).toBe(false);
    expect(needsExecutiveDirectLeaveApproval(null, withLead)).toBe(true);
  });

  it("sends team-lead applications straight to executive", () => {
    expect(applicantSkipsTeamLeadLeaveStep("TEAM_LEAD")).toBe(true);
    expect(applicantSkipsTeamLeadLeaveStep("USER")).toBe(false);
    const withLead = new Set(["마케팅"]);
    expect(
      canExecutiveFinalApproveLeave({
        status: "PENDING",
        applicantDepartment: "마케팅",
        applicantRole: "TEAM_LEAD",
        departmentsWithTeamLead: withLead,
      })
    ).toBe(true);
    expect(
      canExecutiveFinalApproveLeave({
        status: "PENDING",
        applicantDepartment: "마케팅",
        applicantRole: "USER",
        departmentsWithTeamLead: withLead,
      })
    ).toBe(false);
    expect(
      canExecutiveFinalApproveLeave({
        status: "TEAM_LEAD_APPROVED",
        applicantDepartment: "마케팅",
        applicantRole: "USER",
        departmentsWithTeamLead: withLead,
      })
    ).toBe(true);
  });
});

describe("leaveRequestListWhere", () => {
  it("scopes team lead list to own, approved peers, and same department", () => {
    const where = leaveRequestListWhere("u1", "TEAM_LEAD", "마케팅");
    expect(where).toEqual({
      OR: [
        { userId: "u1" },
        { status: "APPROVED" },
        { user: { department: "마케팅" } },
      ],
    });
  });

  it("executive sees all requests", () => {
    expect(leaveRequestListWhere("u1", "EXECUTIVE", "마케팅")).toEqual({});
  });

  it("CS center chief list matches team-lead scope", () => {
    expect(leaveRequestListWhere("u1", "CENTER_CHIEF", "CS팀")).toEqual({
      OR: [
        { userId: "u1" },
        { status: "APPROVED" },
        { user: { department: "CS팀" } },
      ],
    });
  });

  it("non-CS center chief does not get team-lead list scope", () => {
    expect(leaveRequestListWhere("u1", "CENTER_CHIEF", "마케팅")).toEqual({
      OR: [{ status: "APPROVED" }, { userId: "u1" }],
    });
  });
});
