import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScope, getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  isAllDay: z.boolean().optional(),
  inviteUserIds: z.array(z.string()).optional(),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = await getServerWorkspaceScopeFromRequest(req);
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const where =
      scope === "PERSONAL"
        ? { scope: "PERSONAL" as const, userId: session.user.id }
        : { scope: "TEAM" as const, ...(isAdmin ? {} : { userId: session.user.id }) };

    const schedules = await prisma.schedule.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            position: true,
            currentProject: { select: { name: true, brand: { select: { name: true } } } },
          },
        },
      },
      orderBy: { startTime: "asc" },
    });

    return NextResponse.json(schedules);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "일정을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const scope = await getServerWorkspaceScope();
    const schedule = await prisma.schedule.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        startTime: new Date(parsed.data.startTime),
        endTime: new Date(parsed.data.endTime),
        isAllDay: parsed.data.isAllDay ?? false,
        userId: session.user.id,
        scope: scope === "PERSONAL" ? "PERSONAL" : "TEAM",
      },
    });

    const inviteUserIds = parsed.data.inviteUserIds ?? [];
    if (inviteUserIds.length > 0) {
      await prisma.scheduleInvite.createMany({
        data: inviteUserIds
          .filter((id: string) => id !== session.user.id)
          .map((toUserId: string) => ({
            scheduleId: schedule.id,
            fromUserId: session.user.id!,
            toUserId,
            status: "PENDING",
          })),
      });
    }

    return NextResponse.json(schedule);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "일정을 저장할 수 없습니다." },
      { status: 500 }
    );
  }
}
