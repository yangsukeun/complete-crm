import "server-only";
import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { resolveEffectivePermissionsJson } from "@/lib/permissions-resolve";
import { userHasPermission } from "@/lib/permissions";
import { isExecutiveOrAdmin } from "@/lib/role-access";
import { canUseAwayFeature, canViewAwayOverview } from "@/lib/attendance-away-access";

export async function requireAttendanceImport() {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const permissions = await resolveEffectivePermissionsJson(session.user.id);
  if (!userHasPermission({ role: session.user.role, permissions }, "attendance_import")) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, session };
}

/** CS팀 계정 일괄 생성 — 대표/관리자만. attendance_import 위임 계정은 불가. */
export async function requireAttendanceCsAccountCreate() {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isExecutiveOrAdmin(session.user.role)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "관리자에게 계정 생성을 요청하세요." },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const, session };
}

export async function requireAwayActor() {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, department: true, permissions: true, role: true, name: true },
  });
  if (!user || !canUseAwayFeature(user)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, session, user };
}

export async function requireAwayOverview() {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { department: true, role: true },
  });
  if (!user || !canViewAwayOverview(user)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, session };
}

export async function closeOpenAwayLogs(userId: string, at: Date) {
  return prisma.awayLog.updateMany({
    where: { userId, endedAt: null },
    data: { endedAt: at },
  });
}
