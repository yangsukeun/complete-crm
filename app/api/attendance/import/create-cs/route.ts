import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAttendanceCsAccountCreate } from "@/lib/attendance-admin";
import { createEmployee, CreateEmployeeError } from "@/lib/create-employee";
import { suggestedCsLogin } from "@/lib/attendance-import-match";

export const runtime = "nodejs";

type Body = {
  employees?: { machineNo: string; name: string }[];
};

async function uniqueCsEmail(baseEmail: string): Promise<string> {
  const at = baseEmail.indexOf("@");
  const local = at >= 0 ? baseEmail.slice(0, at) : baseEmail;
  const domain = at >= 0 ? baseEmail.slice(at) : "@complete.local";
  for (let n = 0; n < 20; n++) {
    const email = n === 0 ? `${local}${domain}` : `${local}.${n}${domain}`;
    const exists = await prisma.user.findUnique({ where: { email } });
    if (!exists) return email;
  }
  throw new CreateEmployeeError("사용 가능한 CS 이메일을 만들지 못했습니다.", 400);
}

export async function POST(req: Request) {
  try {
    const auth = await requireAttendanceCsAccountCreate();
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as Body;
    const list = Array.isArray(body.employees) ? body.employees : [];
    if (list.length === 0) {
      return NextResponse.json({ error: "생성할 인원이 없습니다." }, { status: 400 });
    }

    const csPosition = await prisma.position.findFirst({
      where: { name: { equals: "CS", mode: "insensitive" } },
      select: { name: true },
    });

    const created: {
      machineNo: string;
      name: string;
      userId: string;
      email: string;
      password: string;
      department: string | null;
    }[] = [];
    const errors: { machineNo: string; name: string; message: string }[] = [];

    for (const emp of list) {
      const machineNo = String(emp.machineNo ?? "").trim();
      const name = String(emp.name ?? "").trim();
      if (!machineNo || !name) {
        errors.push({ machineNo, name, message: "사원번호와 성명이 필요합니다." });
        continue;
      }

      const taken = await prisma.user.findUnique({
        where: { attendanceMachineNo: machineNo },
        select: { id: true, name: true },
      });
      if (taken) {
        errors.push({
          machineNo,
          name,
          message: `이미 ${taken.name} 계정에 연결된 번호입니다.`,
        });
        continue;
      }

      const login = suggestedCsLogin(machineNo);
      try {
        const email = await uniqueCsEmail(login.email);
        const user = await createEmployee({
          email,
          password: login.password,
          name,
          role: "USER",
          department: "CS팀",
          position: csPosition?.name ?? "CS",
          attendanceMachineNo: machineNo,
        });
        created.push({
          machineNo,
          name: user.name,
          userId: user.id,
          email: user.email,
          password: login.password,
          department: user.department,
        });
      } catch (e) {
        const message = e instanceof CreateEmployeeError ? e.message : "계정 생성 실패";
        errors.push({ machineNo, name, message });
      }
    }

    if (created.length > 0) {
      revalidateTag("users-list", "max");
    }

    return NextResponse.json({
      created: created.length,
      failed: errors.length,
      createdList: created,
      errors,
    });
  } catch (e) {
    console.error("attendance import create-cs:", e);
    return NextResponse.json({ error: "CS팀 계정 일괄 생성에 실패했습니다." }, { status: 500 });
  }
}
