import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { canMutateSchedule, canViewSchedule, isCsSchedulerMember } from "@/lib/schedule-team-access";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  isAllDay: z.boolean().optional(),
});

async function loadViewerAndSchedule(userId: string, scheduleId: string) {
  const [me, schedule] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, department: true },
    }),
    prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        user: { select: { name: true, position: true, department: true, role: true } },
      },
    }),
  ]);
  return { me, schedule };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { me, schedule } = await loadViewerAndSchedule(session.user.id, id);
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!schedule) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ownerIsCsScheduler = isCsSchedulerMember(schedule.user);
    if (
      !canViewSchedule({
        viewer: me,
        scheduleUserId: schedule.userId,
        scheduleScope: schedule.scope,
        ownerIsCsScheduler,
      })
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(schedule);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "일정을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { me, schedule: existing } = await loadViewerAndSchedule(session.user.id, id);
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ownerIsCsScheduler = isCsSchedulerMember(existing.user);
    if (!canMutateSchedule({ viewer: me, scheduleUserId: existing.userId, ownerIsCsScheduler })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: Parameters<typeof prisma.schedule.update>[0]["data"] = {};
    if (parsed.data.title != null) data.title = parsed.data.title;
    if (parsed.data.description !== undefined) data.description = parsed.data.description ?? null;
    if (parsed.data.startTime != null) data.startTime = new Date(parsed.data.startTime);
    if (parsed.data.endTime != null) data.endTime = new Date(parsed.data.endTime);
    if (parsed.data.isAllDay != null) data.isAllDay = parsed.data.isAllDay;

    const schedule = await prisma.schedule.update({
      where: { id },
      data,
    });

    return NextResponse.json(schedule);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "일정을 수정할 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { me, schedule: existing } = await loadViewerAndSchedule(session.user.id, id);
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ownerIsCsScheduler = isCsSchedulerMember(existing.user);
    if (!canMutateSchedule({ viewer: me, scheduleUserId: existing.userId, ownerIsCsScheduler })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.schedule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "일정을 삭제할 수 없습니다." },
      { status: 500 }
    );
  }
}
