import { describe, expect, it } from "vitest";
import {
  getFinanceScope,
  isPaymentRequestInFinanceScope,
} from "@/lib/finance-scope";
import { getUserDepartments } from "@/lib/user-departments";

describe("getFinanceScope", () => {
  it("ADMIN/EXECUTIVE → ALL", () => {
    expect(
      getFinanceScope({
        userId: "u1",
        role: "EXECUTIVE",
        department: "경영",
        transferExecutorIds: [],
      }).kind
    ).toBe("ALL");
    expect(
      getFinanceScope({
        userId: "u1",
        role: "ADMIN",
        department: null,
        transferExecutorIds: ["u1"],
      }).label
    ).toBe("전체");
  });

  it("이체담당자 → ALL (팀장이어도 기존 범위 유지)", () => {
    const scope = getFinanceScope({
      userId: "kim",
      role: "USER",
      department: "경영지원",
      transferExecutorIds: ["kim"],
    });
    expect(scope.kind).toBe("ALL");
    expect(scope.isTransferExecutor).toBe(true);

    const leadAlso = getFinanceScope({
      userId: "kim",
      role: "TEAM_LEAD",
      department: "마케팅",
      transferExecutorIds: ["kim"],
    });
    expect(leadAlso.kind).toBe("ALL");
  });

  it("TEAM_LEAD / CENTER_CHIEF → DEPARTMENT (주부서+겸직)", () => {
    const lead = getFinanceScope({
      userId: "tl",
      role: "TEAM_LEAD",
      department: "마케팅",
      transferExecutorIds: [],
    });
    expect(lead.kind).toBe("DEPARTMENT");
    expect(lead.label).toBe("마케팅 내역");

    const leadDual = getFinanceScope({
      userId: "tl",
      role: "TEAM_LEAD",
      userDepartments: getUserDepartments({
        department: "마케팅",
        additionalDepartments: ["CS팀"],
      }),
      transferExecutorIds: [],
    });
    expect(leadDual.kind).toBe("DEPARTMENT");
    expect(leadDual.departments).toEqual(["마케팅", "CS팀"]);
    expect(leadDual.label).toBe("마케팅 + CS팀 내역");
    expect(
      isPaymentRequestInFinanceScope(leadDual, {
        requesterId: "x",
        requester: { department: "CS팀" },
      })
    ).toBe(true);
  });

  it("비팀장 겸직+finance_view → SELF_AND_DEPARTMENTS", () => {
    const scope = getFinanceScope({
      userId: "gopro",
      role: "USER",
      userDepartments: getUserDepartments({
        department: "경영지원",
        additionalDepartments: ["마케팅"],
      }),
      transferExecutorIds: [],
      hasFinanceView: true,
    });
    expect(scope.kind).toBe("SELF_AND_DEPARTMENTS");
    expect(scope.label).toBe("마케팅 + 내 신청 내역");
    expect(scope.departments).toEqual(["마케팅"]);
    expect(
      isPaymentRequestInFinanceScope(scope, {
        requesterId: "other",
        requester: { department: "마케팅" },
      })
    ).toBe(true);
    expect(
      isPaymentRequestInFinanceScope(scope, {
        requesterId: "gopro",
        requester: { department: "경영지원" },
      })
    ).toBe(true);
    expect(
      isPaymentRequestInFinanceScope(scope, {
        requesterId: "other",
        requester: { department: "CS팀" },
      })
    ).toBe(false);
    expect(
      isPaymentRequestInFinanceScope(scope, {
        requesterId: "other",
        requester: { department: "경영지원" },
      })
    ).toBe(false);
  });

  it("겸직 없거나 finance_view 없으면 SELF (회귀)", () => {
    expect(
      getFinanceScope({
        userId: "gopro",
        role: "USER",
        department: "마케팅",
        transferExecutorIds: [],
        hasFinanceView: true,
      }).kind
    ).toBe("SELF");
    expect(
      getFinanceScope({
        userId: "gopro",
        role: "USER",
        userDepartments: getUserDepartments({
          department: "경영지원",
          additionalDepartments: ["마케팅"],
        }),
        transferExecutorIds: [],
        hasFinanceView: false,
      }).kind
    ).toBe("SELF");
  });

  it("겸직 해제 → SELF", () => {
    const cleared = getFinanceScope({
      userId: "gopro",
      role: "USER",
      userDepartments: getUserDepartments({
        department: "경영지원",
        additionalDepartments: [],
      }),
      transferExecutorIds: [],
      hasFinanceView: true,
    });
    expect(cleared.kind).toBe("SELF");
    expect(cleared.label).toBe("내 신청 내역");
  });
});

describe("isPaymentRequestInFinanceScope", () => {
  it("SELF: 본인 건만", () => {
    const scope = getFinanceScope({
      userId: "me",
      role: "USER",
      department: "마케팅",
      transferExecutorIds: [],
    });
    expect(isPaymentRequestInFinanceScope(scope, { requesterId: "me" })).toBe(true);
    expect(isPaymentRequestInFinanceScope(scope, { requesterId: "other" })).toBe(false);
  });

  it("DEPARTMENT: 신청자 부서 일치 (CS 3단계 건 포함)", () => {
    const scope = getFinanceScope({
      userId: "cs-lead",
      role: "TEAM_LEAD",
      department: "CS팀",
      transferExecutorIds: [],
    });
    expect(
      isPaymentRequestInFinanceScope(scope, {
        requesterId: "a",
        requester: { department: "CS팀" },
      })
    ).toBe(true);
    expect(
      isPaymentRequestInFinanceScope(scope, {
        requesterId: "b",
        requester: { department: "마케팅" },
      })
    ).toBe(false);
  });

  it("ALL: 모두 허용", () => {
    const scope = getFinanceScope({
      userId: "exec",
      role: "EXECUTIVE",
      department: null,
      transferExecutorIds: [],
    });
    expect(
      isPaymentRequestInFinanceScope(scope, {
        requesterId: "anyone",
        requester: { department: "마케팅" },
      })
    ).toBe(true);
  });
});
