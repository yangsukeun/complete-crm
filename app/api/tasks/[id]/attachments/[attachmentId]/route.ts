import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { deleteFile, parseGoogleDriveFileIdFromUrl } from "@/lib/storage/google-drive-storage";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: taskId, attachmentId } = await params;
    const att = await prisma.taskAttachment.findFirst({
      where: { id: attachmentId, taskId },
    });
    if (!att) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const task = await prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const allowed =
      session.user.role === "EXECUTIVE" ||
      session.user.role === "ADMIN" ||
      task.assignedToId === session.user.id ||
      task.createdById === session.user.id;
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const fid = parseGoogleDriveFileIdFromUrl(att.url);
    await prisma.taskAttachment.delete({ where: { id: attachmentId } });
    if (fid) {
      console.log("[tasks] attachment DELETE → Drive deleteFile", {
        taskId,
        attachmentId,
        fileIdPrefix: fid.slice(0, 12) + "…",
      });
      await deleteFile(fid);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE task attachment:", e);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
