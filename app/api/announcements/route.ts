import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

export type PollOption = { text: string; voterIds: string[] };

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  eventDate: z.string().optional().nullable(),
  eventEndDate: z.string().optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  pollOptions: z.array(z.string().min(1).max(200)).min(0).max(20).optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const list = await prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        eventDate: true,
        eventEndDate: true,
        location: true,
        pollData: true,
        createdBy: { select: { name: true, position: true } },
      },
    });

    return NextResponse.json(
      list.map((a) => {
        const poll = a.pollData ? (JSON.parse(a.pollData) as PollOption[]) : null;
        const myVote =
          poll && session?.user?.id
            ? poll.findIndex((o) => o.voterIds.includes(session!.user!.id))
            : -1;
        return {
          id: a.id,
          title: a.title,
          content: a.content,
          createdAt: a.createdAt.toISOString(),
          eventDate: a.eventDate?.toISOString() ?? null,
          eventEndDate: a.eventEndDate?.toISOString() ?? null,
          location: a.location ?? null,
          pollOptions: poll?.map((o) => ({ text: o.text, count: o.voterIds.length })) ?? null,
          myVoteIndex: myVote >= 0 ? myVote : null,
          createdByName: a.createdBy.name,
          createdByPosition: a.createdBy.position,
        };
      })
    );
  } catch (e) {
    console.error("Announcements GET:", e);
    return NextResponse.json({ error: "공지사항을 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role;
    if (role !== "TEAM_LEAD" && role !== "EXECUTIVE" && role !== "ADMIN") {
      return NextResponse.json({ error: "팀장 이상만 공지사항을 등록할 수 있습니다." }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "제목과 내용을 입력하세요." }, { status: 400 });
    }

    const pollData =
      parsed.data.pollOptions && parsed.data.pollOptions.length > 0
        ? JSON.stringify(
            parsed.data.pollOptions.filter(Boolean).map((text) => ({ text: text.trim(), voterIds: [] as string[] }))
          )
        : null;

    const created = await prisma.announcement.create({
      data: {
        title: parsed.data.title.trim(),
        content: parsed.data.content.trim(),
        createdById: session.user.id,
        eventDate: parsed.data.eventDate ? new Date(parsed.data.eventDate) : null,
        eventEndDate: parsed.data.eventEndDate ? new Date(parsed.data.eventEndDate) : null,
        location: parsed.data.location?.trim() || null,
        pollData,
      },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        eventDate: true,
        eventEndDate: true,
        location: true,
        pollData: true,
      },
    });

    return NextResponse.json({
      ...created,
      createdAt: created.createdAt.toISOString(),
      eventDate: created.eventDate?.toISOString() ?? null,
      eventEndDate: created.eventEndDate?.toISOString() ?? null,
    });
  } catch (e) {
    console.error("Announcements POST:", e);
    return NextResponse.json({ error: "공지사항 등록에 실패했습니다." }, { status: 500 });
  }
}
