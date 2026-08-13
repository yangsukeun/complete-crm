import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canManageCsClients } from "@/lib/cs-client-access";
import { serializeCsClient, csClientInclude } from "@/lib/cs-client-serialize";
import { isCsDepartment } from "@/lib/cs-tools-access";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, department: true },
    });
    if (!me || !canManageCsClients(me)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const client = await prisma.csClient.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: "업체를 찾을 수 없습니다." }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      assignments?: { userId?: unknown; roleLabel?: unknown }[];
    };
    const raw = Array.isArray(body.assignments) ? body.assignments : [];
    const next: { userId: string; roleLabel: string }[] = [];
    const seen = new Set<string>();
    for (const a of raw) {
      const userId = typeof a.userId === "string" ? a.userId : "";
      const roleLabel = typeof a.roleLabel === "string" ? a.roleLabel.trim() : "";
      if (!userId || seen.has(userId)) continue;
      seen.add(userId);
      next.push({ userId, roleLabel: roleLabel || "담당" });
    }

    if (next.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: next.map((n) => n.userId) } },
        select: { id: true, department: true },
      });
      const allowed = new Set(users.filter((u) => isCsDepartment(u.department)).map((u) => u.id));
      if (next.some((n) => !allowed.has(n.userId))) {
        return NextResponse.json({ error: "CS 직원만 담당자로 지정할 수 있습니다." }, { status: 400 });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.csClientAssignment.deleteMany({ where: { clientId: id } });
      if (next.length > 0) {
        await tx.csClientAssignment.createMany({
          data: next.map((n) => ({ clientId: id, userId: n.userId, roleLabel: n.roleLabel })),
        });
      }
      await tx.csClient.update({
        where: { id },
        data: { updatedBy: me.id },
      });
      return tx.csClient.findUniqueOrThrow({
        where: { id },
        include: csClientInclude,
      });
    });

    return NextResponse.json(serializeCsClient(updated));
  } catch {
    console.error("[cs-clients] assignments failed");
    return NextResponse.json({ error: "담당자 저장에 실패했습니다." }, { status: 500 });
  }
}
