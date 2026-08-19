import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canViewCsOrg, canManageCsClients } from "@/lib/cs-client-access";
import {
  allowedCsOrgManagers,
  csOrgRank,
  csOrgWouldCycle,
  flattenCsOrgPeople,
  resolveCsOrgReports,
} from "@/lib/cs-org";
import { loadCsOrgPeople } from "@/lib/cs-org-data";

async function loadMe(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, department: true },
  });
}

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = await loadMe(session.user.id);
    if (!me || !canViewCsOrg(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { people, explicit } = await loadCsOrgPeople();
    const resolved = flattenCsOrgPeople(people, explicit);
    return NextResponse.json({
      people: resolved.map((p) => ({
        ...p,
        rank: csOrgRank(p.position),
      })),
      canManage: canManageCsClients(me),
    });
  } catch {
    console.error("[cs-org] reports get failed");
    return NextResponse.json({ error: "조직도를 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = await loadMe(session.user.id);
    if (!me || !canManageCsClients(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      reports?: unknown;
    };
    if (!Array.isArray(body.reports)) {
      return NextResponse.json({ error: "소속 목록이 필요합니다." }, { status: 400 });
    }

    const { people, explicit } = await loadCsOrgPeople();
    const byId = new Map(people.map((p) => [p.id, p]));
    const nextExplicit = new Map(explicit);

    for (const row of body.reports) {
      if (!row || typeof row !== "object") {
        return NextResponse.json({ error: "잘못된 소속 값입니다." }, { status: 400 });
      }
      const userId = "userId" in row && typeof row.userId === "string" ? row.userId : "";
      const reportsToId =
        "reportsToId" in row && (row.reportsToId === null || typeof row.reportsToId === "string")
          ? row.reportsToId
          : undefined;
      if (!userId || reportsToId === undefined) {
        return NextResponse.json({ error: "잘못된 소속 값입니다." }, { status: 400 });
      }
      const person = byId.get(userId);
      if (!person) {
        return NextResponse.json({ error: "CS 구성원이 아닙니다." }, { status: 400 });
      }
      if (!reportsToId) {
        nextExplicit.delete(userId);
        continue;
      }
      const allowed = allowedCsOrgManagers(person, people);
      if (!allowed.some((p) => p.id === reportsToId)) {
        return NextResponse.json(
          { error: `${person.name}의 소속 상사를 확인할 수 없습니다.` },
          { status: 400 }
        );
      }
      nextExplicit.set(userId, reportsToId);
    }

    const resolved = resolveCsOrgReports(people, nextExplicit);
    for (const person of people) {
      const parent = resolved.get(person.id);
      if (parent && csOrgWouldCycle(person.id, parent, resolved)) {
        return NextResponse.json({ error: "순환 소속은 지정할 수 없습니다." }, { status: 400 });
      }
    }

    const rows = people
      .map((p) => {
        const reportsToId = nextExplicit.get(p.id) ?? null;
        return reportsToId ? { userId: p.id, reportsToId } : null;
      })
      .filter((row): row is { userId: string; reportsToId: string } => Boolean(row));

    await prisma.$transaction(async (tx) => {
      const csIds = people.map((p) => p.id);
      await tx.csOrgReport.deleteMany({ where: { userId: { in: csIds } } });
      if (rows.length > 0) {
        await tx.csOrgReport.createMany({ data: rows });
      }
    });

    const refreshed = flattenCsOrgPeople(people, nextExplicit);
    return NextResponse.json({
      people: refreshed.map((p) => ({
        ...p,
        rank: csOrgRank(p.position),
      })),
      canManage: true,
    });
  } catch {
    console.error("[cs-org] reports put failed");
    return NextResponse.json({ error: "소속을 저장할 수 없습니다." }, { status: 500 });
  }
}
