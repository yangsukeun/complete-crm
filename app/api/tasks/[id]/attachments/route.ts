import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

/**
 * 게시판 첨부와 동일 정책: 로컬 스토리지 등이 `/uploads/...` 같은 상대 경로를 반환할 수 있음.
 * `z.string().url()` 은 이를 거부해 파일 첨부(특히 업로드 직후)가 실패함.
 */
const postSchema = z.object({
  type: z.enum(["LINK", "VIDEO", "FILE"]),
  url: z.string().trim().min(1, "url 필요"),
  name: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: taskId } = await params;
    const task = await prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        assignedToId: true,
        createdById: true,
        assignees: { where: { userId: session.user.id }, select: { userId: true }, take: 1 },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const allowed =
      (session.user.role === "EXECUTIVE" || session.user.role === "ADMIN") ||
      task.assignedToId === session.user.id ||
      task.createdById === session.user.id ||
      task.assignees.length > 0;
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const hint =
        first.url?.[0] ||
        first.type?.[0] ||
        parsed.error.issues[0]?.message ||
        "type(LINK|VIDEO|FILE), url 필요";
      return NextResponse.json({ error: hint }, { status: 400 });
    }

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        type: parsed.data.type,
        url: parsed.data.url,
        name: parsed.data.name?.trim() ?? null,
      },
    });
    return NextResponse.json(attachment);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "첨부 추가에 실패했습니다." },
      { status: 500 }
    );
  }
}
