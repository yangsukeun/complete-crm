import { describe, expect, it } from "vitest";
import {
  canTeamLeadManageLeaveApplicant,
  canFirstApproveLeave,
  canCsCenterChiefFinalApproveLeave,
  canExecutiveFinalApproveLeave,
  csLeaveFinalIsCenterChief,
  teamLeadNotifyWhereForApplicantDepartment,
  leaveNewRequestNotifyWhere,
  leaveAfterFirstApprovalNotifyWhere,
  departmentHasTeamLead,
  needsExecutiveDirectLeaveApproval,
  applicantSkipsTeamLeadLeaveStep,
} from "@/lib/leave-department-access";
import { leaveRequestListWhere } from "@/lib/leave-request-serialize";

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

  it("notifies CS first line as team lead only", () => {
    expect(teamLeadNotifyWhereForApplicantDepartment("CS팀")).toEqual({
      role: "TEAM_LEAD",
      department: "CS팀",
    });
    expect(
      leaveNewRequestNotifyWhere({
        applicantDepartment: "CS팀",
        applicantRole: "USER",
        skipTeamLeadStep: false,
      })
    ).toEqual({ role: "TEAM_LEAD", department: "CS팀" });
    expect(
      leaveNewRequestNotifyWhere({
        applicantDepartment: "CS팀",
        applicantRole: "TEAM_LEAD",
        skipTeamLeadStep: true,
      })
    ).toEqual({ role: "CENTER_CHIEF", department: "CS팀" });
    expect(
      leaveAfterFirstApprovalNotifyWhere({
        applicantDepartment: "CS팀",
        applicantRole: "USER",
      })
    ).toEqual({ role: "CENTER_CHIEF", department: "CS팀" });
  });

  it("lets only same-department team lead first-approve", () => {
    expect(
      canFirstApproveLeave({
        viewerRole: "CENTER_CHIEF",
        viewerDepartment: "CS팀",
        applicantDepartment: "CS팀",
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
    expect(applicantSkipsTeamLeadLeaveStep("CENTER_CHIEF")).toBe(true);
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

  it("stops CS staff leave at center chief, not executive", () => {
    const withLead = new Set(["CS팀", "마케팅"]);
    expect(csLeaveFinalIsCenterChief("CS팀", "USER")).toBe(true);
    expect(csLeaveFinalIsCenterChief("CS팀", "TEAM_LEAD")).toBe(true);
    expect(csLeaveFinalIsCenterChief("CS팀", "CENTER_CHIEF")).toBe(false);
    expect(csLeaveFinalIsCenterChief("마케팅", "USER")).toBe(false);

    expect(
      canExecutiveFinalApproveLeave({
        status: "TEAM_LEAD_APPROVED",
        applicantDepartment: "CS팀",
        applicantRole: "USER",
        departmentsWithTeamLead: withLead,
      })
    ).toBe(false);
    expect(
      canExecutiveFinalApproveLeave({
        status: "TEAM_LEAD_APPROVED",
        applicantDepartment: "CS팀",
        applicantRole: "TEAM_LEAD",
        departmentsWithTeamLead: withLead,
      })
    ).toBe(false);
    expect(
      canExecutiveFinalApproveLeave({
        status: "TEAM_LEAD_APPROVED",
        applicantDepartment: "CS팀",
        applicantRole: "CENTER_CHIEF",
        departmentsWithTeamLead: withLead,
      })
    ).toBe(true);

    expect(
      canCsCenterChiefFinalApproveLeave({
        viewerRole: "CENTER_CHIEF",
        viewerDepartment: "CS팀",
        applicantDepartment: "CS팀",
        applicantRole: "USER",
        status: "TEAM_LEAD_APPROVED",
        departmentsWithTeamLead: withLead,
      })
    ).toBe(true);
    expect(
      canCsCenterChiefFinalApproveLeave({
        viewerRole: "CENTER_CHIEF",
        viewerDepartment: "CS팀",
        applicantDepartment: "CS팀",
        applicantRole: "TEAM_LEAD",
        status: "TEAM_LEAD_APPROVED",
        departmentsWithTeamLead: withLead,
      })
    ).toBe(true);
    expect(
      canCsCenterChiefFinalApproveLeave({
        viewerRole: "CENTER_CHIEF",
        viewerDepartment: "CS팀",
        applicantDepartment: "마케팅",
        applicantRole: "USER",
        status: "TEAM_LEAD_APPROVED",
        departmentsWithTeamLead: withLead,
      })
    ).toBe(false);
  });
});

describe("leaveRequestListWhere", () => {
  it("scopes team lead list to own, HQ-approved peers, and same department", () => {
    const where = leaveRequestListWhere("u1", "TEAM_LEAD", "마케팅");
    expect(where).toEqual({
      OR: [
        { userId: "u1" },
        { status: "APPROVED", user: { NOT: { department: { in: ["CS", "CS팀"] } } } },
        { user: { department: "마케팅" } },
      ],
    });
  });

  it("executive sees all requests", () => {
    expect(leaveRequestListWhere("u1", "EXECUTIVE", "마케팅")).toEqual({});
  });

  it("CS center chief list matches team-lead scope with CS-only approved", () => {
    expect(leaveRequestListWhere("u1", "CENTER_CHIEF", "CS팀")).toEqual({
      OR: [
        { userId: "u1" },
        { status: "APPROVED", user: { department: { in: ["CS", "CS팀"] } } },
        { user: { department: "CS팀" } },
      ],
    });
  });

  it("non-CS center chief does not get team-lead list scope", () => {
    expect(leaveRequestListWhere("u1", "CENTER_CHIEF", "마케팅")).toEqual({
      OR: [
        { status: "APPROVED", user: { NOT: { department: { in: ["CS", "CS팀"] } } } },
        { userId: "u1" },
      ],
    });
  });

  it("CS staff see only CS-group approved leaves plus own", () => {
    expect(leaveRequestListWhere("u1", "USER", "CS팀")).toEqual({
      OR: [
        { status: "APPROVED", user: { department: { in: ["CS", "CS팀"] } } },
        { userId: "u1" },
      ],
    });
  });
});
