import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import type { PollOption } from "../../route";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const optionIndex = typeof body?.optionIndex === "number" ? body.optionIndex : -1;

    const announcement = await prisma.announcement.findUnique({
      where: { id },
      select: { pollData: true },
    });
    if (!announcement?.pollData) {
      return NextResponse.json({ error: "해당 공지에 투표가 없습니다." }, { status: 400 });
    }

    const poll: PollOption[] = JSON.parse(announcement.pollData);
    if (optionIndex < 0 || optionIndex >= poll.length) {
      return NextResponse.json({ error: "잘못된 선택입니다." }, { status: 400 });
    }

    const alreadyVoted = poll.some((o: any) => o.voterIds.includes(session.user!.id));
    if (alreadyVoted) {
      return NextResponse.json({ error: "이미 투표하셨습니다." }, { status: 400 });
    }

    poll[optionIndex].voterIds.push(session.user!.id);
    await prisma.announcement.update({
      where: { id },
      data: { pollData: JSON.stringify(poll) },
    });

    return NextResponse.json({
      success: true,
      optionIndex,
      newCount: poll[optionIndex].voterIds.length,
    });
  } catch (e) {
    console.error("Announcement vote:", e);
    return NextResponse.json({ error: "투표 처리에 실패했습니다." }, { status: 500 });
  }
}
