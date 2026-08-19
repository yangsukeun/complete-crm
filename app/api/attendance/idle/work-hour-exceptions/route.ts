import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAwayOverview } from "@/lib/attendance-admin";
import { csOrgRank, csOrgRankLabel, flattenCsOrgPeople } from "@/lib/cs-org";
import { loadCsOrgPeople } from "@/lib/cs-org-data";

export const runtime = "nodejs";

function serializeException(row: {
  employeeId: string;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    employeeId: row.employeeId,
    reason: row.reason ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireCsEmployeeId(employeeId: string) {
  const { people } = await loadCsOrgPeople();
  return people.find((p) => p.id === employeeId) ?? null;
}

export async function GET() {
  try {
    const auth = await requireAwayOverview();
    if (!auth.ok) return auth.response;

    const [{ people, explicit }, rows] = await Promise.all([
      loadCsOrgPeople(),
      prisma.idleWorkHourException.findMany({ orderBy: { createdAt: "asc" } }),
    ]);
    const employees = flattenCsOrgPeople(people, explicit);

    return NextResponse.json({
      employees: employees.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        rankLabel: csOrgRankLabel(csOrgRank(p.position)),
      })),
      exceptions: rows.map(serializeException),
    });
  } catch (e) {
    console.error("idle work-hour exceptions get:", e);
    return NextResponse.json({ error: "24시간 근무 설정을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAwayOverview();
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as { employeeId?: unknown; reason?: unknown };
    const employeeId = typeof body.employeeId === "string" ? body.employeeId.trim() : "";
    if (!employeeId) return NextResponse.json({ error: "직원을 지정하세요." }, { status: 400 });

    const person = await requireCsEmployeeId(employeeId);
    if (!person) return NextResponse.json({ error: "CS 구성원이 아닙니다." }, { status: 400 });

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const row = await prisma.idleWorkHourException.upsert({
      where: { employeeId },
      create: { employeeId, reason: reason || null },
      update: { reason: reason || null },
    });
    return NextResponse.json(serializeException(row));
  } catch (e) {
    console.error("idle work-hour exceptions post:", e);
    return NextResponse.json({ error: "24시간 근무로 지정하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAwayOverview();
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const fromQuery = url.searchParams.get("employeeId");
    const body = (await req.json().catch(() => ({}))) as { employeeId?: unknown };
    const employeeId =
      (typeof body.employeeId === "string" ? body.employeeId.trim() : "") ||
      (fromQuery ? fromQuery.trim() : "");
    if (!employeeId) return NextResponse.json({ error: "직원을 지정하세요." }, { status: 400 });

    await prisma.idleWorkHourException.deleteMany({ where: { employeeId } });
    return NextResponse.json({ ok: true, employeeId });
  } catch (e) {
    console.error("idle work-hour exceptions delete:", e);
    return NextResponse.json({ error: "24시간 근무 지정을 해제하지 못했습니다." }, { status: 500 });
  }
}
