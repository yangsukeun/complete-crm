import { describe, expect, it } from "vitest";
import {
  getFinanceScope,
  isPaymentRequestInFinanceScope,
} from "@/lib/finance-scope";

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

  it("TEAM_LEAD / CENTER_CHIEF → DEPARTMENT", () => {
    const lead = getFinanceScope({
      userId: "tl",
      role: "TEAM_LEAD",
      department: "마케팅",
      transferExecutorIds: [],
    });
    expect(lead.kind).toBe("DEPARTMENT");
    expect(lead.label).toBe("마케팅 내역");

    const chief = getFinanceScope({
      userId: "cc",
      role: "CENTER_CHIEF",
      department: "CS팀",
      transferExecutorIds: [],
    });
    expect(chief.kind).toBe("DEPARTMENT");
    expect(chief.label).toBe("CS팀 내역");
  });

  it("그 외 → SELF", () => {
    const self = getFinanceScope({
      userId: "gopro",
      role: "USER",
      department: "마케팅",
      transferExecutorIds: [],
    });
    expect(self.kind).toBe("SELF");
    expect(self.label).toBe("내 신청 내역");
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
