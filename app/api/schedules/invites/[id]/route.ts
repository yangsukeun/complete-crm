import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  status: z.enum(["ACCEPTED", "REJECTED"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "status는 ACCEPTED 또는 REJECTED 여야 합니다." },
        { status: 400 }
      );
    }

    const invite = await prisma.scheduleInvite.findUnique({
      where: { id },
      include: { schedule: true },
    });
    if (!invite) {
      return NextResponse.json({ error: "초대를 찾을 수 없습니다." }, { status: 404 });
    }
    if (invite.toUserId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (invite.status !== "PENDING") {
      return NextResponse.json({ error: "이미 처리된 초대입니다." }, { status: 400 });
    }

    if (parsed.data.status === "ACCEPTED") {
      await prisma.schedule.create({
        data: {
          title: invite.schedule.title,
          description: invite.schedule.description,
          startTime: invite.schedule.startTime,
          endTime: invite.schedule.endTime,
          isAllDay: invite.schedule.isAllDay,
          userId: session.user.id,
        },
      });
    }

    const updated = await prisma.scheduleInvite.update({
      where: { id },
      data: { status: parsed.data.status },
      include: {
        schedule: true,
        fromUser: {
          select: {
            name: true,
            position: true,
            currentProject: { select: { name: true, brand: { select: { name: true } } } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "처리에 실패했습니다." },
      { status: 500 }
    );
  }
}
