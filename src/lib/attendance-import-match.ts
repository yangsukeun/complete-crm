export type AttendanceMatchStatus = "matched" | "unmatched" | "linked";

export type CrmUserForAttendanceMatch = {
  id: string;
  name: string;
  department: string | null;
  attendanceMachineNo: string | null;
};

export type AttendanceEmployeeMatch = {
  machineNo: string;
  name: string;
  status: AttendanceMatchStatus;
  userId: string | null;
  userName: string | null;
  userDepartment: string | null;
  existingMachineNo: string | null;
  note: string | null;
};

export function normalizePersonName(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, "").trim();
}

/**
 * 엑셀 성명 ↔ CRM User 매칭.
 * - 기록기 번호가 이미 연결된 계정 → linked
 * - 이름 유일 일치 + 아직 번호 없음 → matched (부서는 건드리지 않음)
 * - 동명이인·이름 없음 → unmatched
 */
export function matchAttendanceEmployees(
  employees: { machineNo: string; name: string }[],
  users: CrmUserForAttendanceMatch[],
): AttendanceEmployeeMatch[] {
  const byMachine = new Map<string, CrmUserForAttendanceMatch>();
  const byName = new Map<string, CrmUserForAttendanceMatch[]>();
  for (const u of users) {
    if (u.attendanceMachineNo) {
      byMachine.set(u.attendanceMachineNo.trim(), u);
    }
    const key = normalizePersonName(u.name);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(u);
    byName.set(key, list);
  }

  return employees.map((emp) => {
    const linked = byMachine.get(emp.machineNo.trim());
    if (linked) {
      return {
        machineNo: emp.machineNo,
        name: emp.name,
        status: "linked" as const,
        userId: linked.id,
        userName: linked.name,
        userDepartment: linked.department,
        existingMachineNo: linked.attendanceMachineNo,
        note: "이미 기록기 번호가 연결되어 있습니다.",
      };
    }

    const candidates = byName.get(normalizePersonName(emp.name)) ?? [];
    if (candidates.length === 0) {
      return {
        machineNo: emp.machineNo,
        name: emp.name,
        status: "unmatched" as const,
        userId: null,
        userName: null,
        userDepartment: null,
        existingMachineNo: null,
        note: null,
      };
    }
    if (candidates.length > 1) {
      return {
        machineNo: emp.machineNo,
        name: emp.name,
        status: "unmatched" as const,
        userId: null,
        userName: null,
        userDepartment: null,
        existingMachineNo: null,
        note: `동명이인 ${candidates.length}명 — 자동 매칭하지 않습니다.`,
      };
    }

    const user = candidates[0];
    if (user.attendanceMachineNo && user.attendanceMachineNo !== emp.machineNo) {
      return {
        machineNo: emp.machineNo,
        name: emp.name,
        status: "unmatched" as const,
        userId: null,
        userName: user.name,
        userDepartment: user.department,
        existingMachineNo: user.attendanceMachineNo,
        note: `같은 이름 계정에 다른 기록기 번호(${user.attendanceMachineNo})가 있습니다.`,
      };
    }

    return {
      machineNo: emp.machineNo,
      name: emp.name,
      status: "matched" as const,
      userId: user.id,
      userName: user.name,
      userDepartment: user.department,
      existingMachineNo: user.attendanceMachineNo,
      note: "이름 일치. 확인 후 기록기 번호만 연결합니다(부서 변경 없음).",
    };
  });
}

export function suggestedCsLogin(machineNo: string): { email: string; password: string } {
  const safe = machineNo.replace(/[^\w가-힣]/g, "") || machineNo;
  let password = `Cs${safe}!`;
  if (password.length < 4) password = `Cs${safe}xx!`;
  return {
    email: `cs${safe}@complete.local`,
    password,
  };
}
