import { hash } from "bcryptjs";
import prisma from "@/lib/prisma";

export type CreateEmployeeRole = "USER" | "TEAM_LEAD" | "CENTER_CHIEF" | "ADMIN" | "EXECUTIVE";

export type CreateEmployeeInput = {
  email: string;
  password: string;
  name: string;
  role?: CreateEmployeeRole;
  phone?: string | null;
  workPhone?: string | null;
  workEmail?: string | null;
  bankAccount?: string | null;
  residentId?: string | null;
  address?: string | null;
  department?: string | null;
  position?: string | null;
  joinDate?: Date;
  attendanceMachineNo?: string | null;
};

export class CreateEmployeeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CreateEmployeeError";
  }
}

function emptyToNull(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

/** 직원 계정 생성 — `/api/users` POST·기록기 임포트 CS 일괄 생성이 공유 */
export async function createEmployee(input: CreateEmployeeInput) {
  const email = input.email.trim();
  if (!email) {
    throw new CreateEmployeeError("이메일은 필수입니다.", 400);
  }
  const name = input.name.trim();
  if (!name) {
    throw new CreateEmployeeError("이름은 필수입니다.", 400);
  }
  if (!input.password || input.password.length < 4) {
    throw new CreateEmployeeError("비밀번호는 4자 이상 입력하세요.", 400);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new CreateEmployeeError("이미 사용 중인 이메일(아이디)입니다.", 400);
  }

  const machineNo = emptyToNull(input.attendanceMachineNo);
  if (machineNo) {
    const taken = await prisma.user.findUnique({
      where: { attendanceMachineNo: machineNo },
    });
    if (taken) {
      throw new CreateEmployeeError("이미 연결된 기록기 사원번호입니다.", 400);
    }
  }

  const hashedPassword = await hash(input.password, 10);
  const joinDate = input.joinDate ?? new Date();

  return prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role: input.role ?? "USER",
      phone: emptyToNull(input.phone),
      workPhone: emptyToNull(input.workPhone),
      workEmail: emptyToNull(input.workEmail),
      bankAccount: emptyToNull(input.bankAccount),
      residentId: emptyToNull(input.residentId),
      address: emptyToNull(input.address),
      department: emptyToNull(input.department),
      position: emptyToNull(input.position),
      joinDate,
      attendanceMachineNo: machineNo,
    },
    select: {
      id: true,
      email: true,
      name: true,
      department: true,
      position: true,
      joinDate: true,
      attendanceMachineNo: true,
    },
  });
}
