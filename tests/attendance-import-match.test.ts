import { describe, expect, it } from "vitest";
import { matchAttendanceEmployees, suggestedCsLogin } from "@/lib/attendance-import-match";

describe("matchAttendanceEmployees", () => {
  const employees = [
    { machineNo: "1", name: "김정우" },
    { machineNo: "2", name: "김소윤" },
    { machineNo: "3", name: "신규자" },
  ];

  it("classifies linked / matched / unmatched", () => {
    const result = matchAttendanceEmployees(employees, [
      { id: "u1", name: "김정우", department: "CS팀", attendanceMachineNo: "1" },
      { id: "u2", name: "김소윤", department: "마케팅", attendanceMachineNo: null },
    ]);
    expect(result[0].status).toBe("linked");
    expect(result[0].userId).toBe("u1");
    expect(result[1].status).toBe("matched");
    expect(result[1].userId).toBe("u2");
    expect(result[1].userDepartment).toBe("마케팅");
    expect(result[2].status).toBe("unmatched");
  });

  it("does not auto-match duplicate names", () => {
    const result = matchAttendanceEmployees([{ machineNo: "9", name: "김정우" }], [
      { id: "a", name: "김정우", department: null, attendanceMachineNo: null },
      { id: "b", name: "김정우", department: null, attendanceMachineNo: null },
    ]);
    expect(result[0].status).toBe("unmatched");
    expect(result[0].note).toMatch(/동명이인/);
  });
});

describe("suggestedCsLogin", () => {
  it("builds email and 4+ char password from machine no", () => {
    const login = suggestedCsLogin("12");
    expect(login.email).toBe("cs12@complete.local");
    expect(login.password.length).toBeGreaterThanOrEqual(4);
  });
});
