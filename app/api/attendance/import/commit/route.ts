import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAttendanceImport } from "@/lib/attendance-admin";
import { kstYmdToUtcDayStart } from "@/lib/date-kst";

export const runtime = "nodejs";

type PunchIn = {
  machineNo: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  raw: string | null;
  incomplete: boolean;
};

type Body = {
  links?: { machineNo: string; userId: string }[];
  punches?: PunchIn[];
};

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function POST(req: Request) {
  try {
    const auth = await requireAttendanceImport();
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as Body;
    const links = Array.isArray(body.links) ? body.links : [];
    const punches = Array.isArray(body.punches) ? body.punches : [];
    if (links.length === 0) {
      return NextResponse.json(
        { error: "연결된 계정이 없습니다. 매칭 확인 또는 CS팀 계정 생성 후 커밋하세요." },
        { status: 400 },
      );
    }

    const userIds = [...new Set(links.map((l) => l.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, department: true, attendanceMachineNo: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const machineToUser = new Map<string, string>();
    const linkErrors: string[] = [];

    for (const link of links) {
      const machineNo = String(link.machineNo ?? "").trim();
      const user = userById.get(link.userId);
      if (!machineNo || !user) {
        linkErrors.push(`사원번호 ${machineNo || "?"} — 계정을 찾을 수 없습니다.`);
        continue;
      }
      if (user.attendanceMachineNo && user.attendanceMachineNo !== machineNo) {
        linkErrors.push(
          `${user.name}: 이미 기록기 번호 ${user.attendanceMachineNo}가 연결되어 있어 ${machineNo}을(를) 덮어쓰지 않습니다.`,
        );
        continue;
      }
      machineToUser.set(machineNo, user.id);
    }

    if (machineToUser.size === 0) {
      return NextResponse.json(
        { error: "저장할 매핑이 없습니다.", details: linkErrors },
        { status: 400 },
      );
    }

    let linkedCount = 0;
    for (const [machineNo, userId] of machineToUser) {
      const user = userById.get(userId);
      if (!user) continue;
      if (user.attendanceMachineNo === machineNo) continue;
      await prisma.user.update({
        where: { id: userId },
        data: { attendanceMachineNo: machineNo },
      });
      user.attendanceMachineNo = machineNo;
      linkedCount += 1;
    }

    let upserted = 0;
    let skippedUnmapped = 0;
    const ops = [];
    for (const p of punches) {
      const machineNo = String(p.machineNo ?? "").trim();
      const userId = machineToUser.get(machineNo);
      if (!userId) {
        skippedUnmapped += 1;
        continue;
      }
      if (!isYmd(p.date)) continue;
      const date = kstYmdToUtcDayStart(p.date);
      const clockIn = p.clockIn ? new Date(p.clockIn) : null;
      const clockOut = p.clockOut ? new Date(p.clockOut) : null;
      ops.push(
        prisma.attendanceRecord.upsert({
          where: {
            userId_date_source: {
              userId,
              date,
              source: "MACHINE_IMPORT",
            },
          },
          create: {
            userId,
            date,
            clockIn: clockIn && !Number.isNaN(clockIn.getTime()) ? clockIn : null,
            clockOut: clockOut && !Number.isNaN(clockOut.getTime()) ? clockOut : null,
            source: "MACHINE_IMPORT",
            raw: p.raw,
            incomplete: Boolean(p.incomplete),
          },
          update: {
            clockIn: clockIn && !Number.isNaN(clockIn.getTime()) ? clockIn : null,
            clockOut: clockOut && !Number.isNaN(clockOut.getTime()) ? clockOut : null,
            raw: p.raw,
            incomplete: Boolean(p.incomplete),
          },
        }),
      );
    }

    const CHUNK = 50;
    for (let i = 0; i < ops.length; i += CHUNK) {
      const chunk = ops.slice(i, i + CHUNK);
      await prisma.$transaction(chunk);
      upserted += chunk.length;
    }

    if (linkedCount > 0) {
      revalidateTag("users-list", "max");
    }

    return NextResponse.json({
      ok: true,
      linkedCount,
      upserted,
      skippedUnmapped,
      linkErrors,
    });
  } catch (e) {
    console.error("attendance import commit:", e);
    return NextResponse.json({ error: "근태 기록 저장에 실패했습니다." }, { status: 500 });
  }
}
