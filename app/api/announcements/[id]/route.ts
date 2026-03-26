import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { isExecutiveOrAdmin } from "@/lib/role-access";

const patchSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  eventDate: z.string().optional().nullable(),
  eventEndDate: z.string().optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  pollOptions: z.array(z.string().min(1).max(200)).min(0).max(20).optional(),
});

async function canManageAnnouncement(
  sessionUserId: string,
  sessionRole: string | undefined,
  createdById: string
) {
  if (createdById === sessionUserId) return true;
  return isExecutiveOrAdmin(sessionRole);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existingFull = await prisma.announcement.findUnique({
      where: { id },
      select: { createdById: true, pollData: true },
    });
    if (!existingFull) {
      return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 404 });
    }

    const role = (session.user as { role?: string }).role;
    if (!(await canManageAnnouncement(session.user.id, role, existingFull.createdById))) {
      return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "입력값을 확인하세요." }, { status: 400 });
    }

    let pollData: string | null | undefined;
    if (parsed.data.pollOptions !== undefined) {
      const trimmed = parsed.data.pollOptions.filter(Boolean).map((t) => String(t).trim());
      if (trimmed.length === 0) {
        pollData = null;
      } else {
        const prev: { text: string; voterIds: string[] }[] = existingFull.pollData
          ? (JSON.parse(existingFull.pollData) as { text: string; voterIds: string[] }[])
          : [];
        const sameShape =
          prev.length === trimmed.length && prev.every((o, i) => o.text === trimmed[i]);
        pollData = sameShape
          ? existingFull.pollData
          : JSON.stringify(trimmed.map((text) => ({ text, voterIds: [] as string[] })));
      }
    }

    const updated = await prisma.announcement.update({
      where: { id },
      data: {
        title: parsed.data.title.trim(),
        content: parsed.data.content.trim(),
        eventDate: parsed.data.eventDate ? new Date(parsed.data.eventDate) : null,
        eventEndDate: parsed.data.eventEndDate ? new Date(parsed.data.eventEndDate) : null,
        location: parsed.data.location?.trim() || null,
        ...(pollData !== undefined ? { pollData } : {}),
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
        createdById: true,
      },
    });

    return NextResponse.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      eventDate: updated.eventDate?.toISOString() ?? null,
      eventEndDate: updated.eventEndDate?.toISOString() ?? null,
    });
  } catch (e) {
    console.error("Announcements PATCH:", e);
    return NextResponse.json({ error: "공지 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.announcement.findUnique({
      where: { id },
      select: { createdById: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 404 });
    }

    const role = (session.user as { role?: string }).role;
    if (!(await canManageAnnouncement(session.user.id, role, existing.createdById))) {
      return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
    }

    await prisma.announcement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Announcements DELETE:", e);
    return NextResponse.json({ error: "공지 삭제에 실패했습니다." }, { status: 500 });
  }
}
