import { NextResponse } from "next/server";
import { differenceInCalendarDays } from "date-fns";
import type { Prisma } from "@prisma/client";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { isMasterSession } from "@/lib/master-account";

export const runtime = "nodejs";

const RETENTION_DAYS = 30;

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = await getServerWorkspaceScopeFromRequest(req);
    const tab = new URL(req.url).searchParams.get("tab") ?? "tasks";
    // 전체 삭제 항목(타인 포함) 열람은 마스터 전용. 그 외는 본인 관련 항목만.
    const isMaster = isMasterSession(session);
    const since = new Date();
    since.setDate(since.getDate() - RETENTION_DAYS);

    if (tab === "tasks") {
      const where: Prisma.TaskWhereInput = {
        deletedAt: { not: null, gte: since },
        scope,
        ...(isMaster
          ? {}
          : {
              OR: [
                { createdById: session.user.id },
                { assignedToId: session.user.id },
                { assignees: { some: { userId: session.user.id } } },
              ],
            }),
      };
      const rows = await prisma.task.findMany({
        where,
        orderBy: { deletedAt: "desc" },
        take: 200,
        select: {
          id: true,
          title: true,
          deletedAt: true,
          project: { select: { id: true, name: true } },
        },
      });
      return NextResponse.json({
        items: rows.map((t) => ({
          id: t.id,
          title: t.title,
          deletedAt: t.deletedAt?.toISOString() ?? null,
          day: t.deletedAt ? differenceInCalendarDays(new Date(), t.deletedAt) + 1 : 0,
          project: t.project,
        })),
      });
    }

    if (tab === "projects") {
      const where: Prisma.ProjectWhereInput = {
        deletedAt: { not: null, gte: since },
        ...(isMaster ? {} : { users: { some: { id: session.user.id } } }),
      };
      const rows = await prisma.project.findMany({
        where,
        orderBy: { deletedAt: "desc" },
        take: 200,
        select: {
          id: true,
          name: true,
          deletedAt: true,
          brand: { select: { name: true } },
        },
      });
      return NextResponse.json({
        items: rows.map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: p.brand?.name ?? null,
          deletedAt: p.deletedAt?.toISOString() ?? null,
          day: p.deletedAt ? differenceInCalendarDays(new Date(), p.deletedAt) + 1 : 0,
        })),
      });
    }

    if (tab === "comments") {
      const where: Prisma.TaskCommentWhereInput = {
        deletedAt: { not: null, gte: since },
        ...(isMaster
          ? {}
          : {
              userId: session.user.id,
            }),
      };
      const rows = await prisma.taskComment.findMany({
        where,
        orderBy: { deletedAt: "desc" },
        take: 200,
        select: {
          id: true,
          body: true,
          deletedAt: true,
          taskId: true,
          task: { select: { title: true } },
        },
      });
      return NextResponse.json({
        items: rows.map((c) => ({
          id: c.id,
          taskId: c.taskId,
          title: c.task?.title ?? "(업무)",
          bodyPreview: (c.body ?? "").slice(0, 80),
          deletedAt: c.deletedAt?.toISOString() ?? null,
          day: c.deletedAt ? differenceInCalendarDays(new Date(), c.deletedAt) + 1 : 0,
        })),
      });
    }

    return NextResponse.json({ error: "Invalid tab" }, { status: 400 });
  } catch (e) {
    console.error("[trash GET]", e);
    return NextResponse.json({ error: "목록을 불러올 수 없습니다." }, { status: 500 });
  }
}
