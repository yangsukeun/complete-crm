import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAttendanceImport } from "@/lib/attendance-admin";
import { parseAttendanceBuffer } from "@/lib/attendance-xls-parse";
import { matchAttendanceEmployees } from "@/lib/attendance-import-match";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const auth = await requireAttendanceImport();
    if (!auth.ok) return auth.response;

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "엑셀 파일을 선택하세요." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "파일이 너무 큽니다. (최대 12MB)" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = parseAttendanceBuffer(buf);

    const users = await prisma.user.findMany({
      where: { accountDisabled: false },
      select: {
        id: true,
        name: true,
        department: true,
        attendanceMachineNo: true,
      },
    });

    const punchCountByMachine = new Map<string, number>();
    for (const p of parsed.punches) {
      punchCountByMachine.set(p.machineNo, (punchCountByMachine.get(p.machineNo) ?? 0) + 1);
    }

    const matches = matchAttendanceEmployees(parsed.employees, users).map((m) => ({
      ...m,
      punchDays: punchCountByMachine.get(m.machineNo) ?? 0,
    }));

    return NextResponse.json({
      year: parsed.year,
      month: parsed.month,
      periodLabel: parsed.periodLabel,
      employees: matches,
      punches: parsed.punches.map((p) => ({
        machineNo: p.machineNo,
        date: p.date,
        clockIn: p.clockIn,
        clockOut: p.clockOut,
        raw: p.raw,
        incomplete: p.incomplete,
      })),
      stats: {
        employeeCount: parsed.employees.length,
        punchRowCount: parsed.punches.length,
        matched: matches.filter((m) => m.status === "matched").length,
        unmatched: matches.filter((m) => m.status === "unmatched").length,
        linked: matches.filter((m) => m.status === "linked").length,
      },
    });
  } catch (e) {
    console.error("attendance import preview:", e);
    const message = e instanceof Error ? e.message : "엑셀을 읽지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
