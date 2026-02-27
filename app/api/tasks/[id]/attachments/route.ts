import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const postSchema = z.object({
  type: z.enum(["LINK", "VIDEO", "FILE"]),
  url: z.string().url(),
  name: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: taskId } = await params;
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const allowed =
      (session.user.role === "EXECUTIVE" || session.user.role === "ADMIN") ||
      task.assignedToId === session.user.id ||
      task.createdById === session.user.id;
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "type(LINK|VIDEO|FILE), url 필요" },
        { status: 400 }
      );
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
