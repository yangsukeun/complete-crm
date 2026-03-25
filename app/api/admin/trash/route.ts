import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { deleteFile, parseGoogleDriveFileIdFromUrl } from "@/lib/storage/google-drive-storage";
import { z } from "zod";

export const runtime = "nodejs";

function isTrashAdmin(role: string | undefined) {
  return role === "EXECUTIVE" || role === "ADMIN";
}

function safeParseBoardAttachments(raw: string | null | undefined): { url: string; name: string }[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is { url?: string; name?: string } => x != null && typeof x === "object")
      .map((x) => ({
        url: typeof x.url === "string" ? x.url : "",
        name: typeof x.name === "string" ? x.name : "파일",
      }))
      .filter((x) => x.url.length > 0);
  } catch {
    return [];
  }
}

const mutateSchema = z.object({
  op: z.enum(["restore", "permanent_delete"]),
  entity: z.enum(["project", "board", "task"]),
  id: z.string().min(1),
});

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id || !isTrashAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [projects, boardPosts, tasks] = await Promise.all([
      prisma.project.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          name: true,
          deletedAt: true,
          brand: { select: { id: true, name: true } },
          deletedBy: { select: { id: true, name: true } },
        },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.boardPost.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          title: true,
          category: true,
          deletedAt: true,
          createdBy: { select: { id: true, name: true } },
          deletedBy: { select: { id: true, name: true } },
        },
        orderBy: { deletedAt: "desc" },
      }),
      prisma.task.findMany({
        where: { deletedAt: { not: null } },
        select: {
          id: true,
          title: true,
          scope: true,
          deletedAt: true,
          createdBy: { select: { id: true, name: true } },
          deletedBy: { select: { id: true, name: true } },
        },
        orderBy: { deletedAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      projects: projects.map((p) => ({
        ...p,
        deletedAt: p.deletedAt?.toISOString() ?? null,
      })),
      boardPosts: boardPosts.map((b) => ({
        ...b,
        deletedAt: b.deletedAt?.toISOString() ?? null,
      })),
      tasks: tasks.map((t) => ({
        ...t,
        deletedAt: t.deletedAt?.toISOString() ?? null,
      })),
    });
  } catch (e) {
    console.error("GET /api/admin/trash", e);
    return NextResponse.json({ error: "목록을 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id || !isTrashAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = mutateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "요청이 올바르지 않습니다." }, { status: 400 });
    }

    const { op, entity, id } = parsed.data;

    if (entity === "project") {
      const project = await prisma.project.findUnique({
        where: { id },
        select: { id: true, deletedAt: true },
      });
      if (!project || !project.deletedAt) {
        return NextResponse.json({ error: "삭제된 프로젝트만 처리할 수 있습니다." }, { status: 400 });
      }

      if (op === "restore") {
        await prisma.project.update({
          where: { id },
          data: { deletedAt: null, deletedById: null },
        });
        return NextResponse.json({ ok: true });
      }

      await prisma.$transaction([
        prisma.user.updateMany({
          where: { currentProjectId: id },
          data: { currentProjectId: null },
        }),
        prisma.project.update({
          where: { id },
          data: { users: { set: [] } },
        }),
      ]);
      await prisma.project.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }

    if (entity === "task") {
      const deadTask = await prisma.task.findFirst({
        where: { id, deletedAt: { not: null } },
        include: { attachments: true },
      });
      if (!deadTask) {
        return NextResponse.json({ error: "삭제된 업무만 처리할 수 있습니다." }, { status: 400 });
      }

      if (op === "restore") {
        await prisma.task.update({
          where: { id },
          data: { deletedAt: null, deletedById: null },
        });
        return NextResponse.json({ ok: true });
      }

      const urls = deadTask.attachments.map((a) => a.url);
      await prisma.task.updateMany({ where: { parentId: id }, data: { parentId: null } });
      await prisma.taskLink.deleteMany({
        where: { OR: [{ parentId: id }, { childId: id }] },
      });
      await prisma.task.delete({ where: { id } });
      console.log("[admin/trash] 업무 영구 삭제 → Drive 첨부 삭제 시도", {
        taskId: id,
        urlCount: urls.length,
      });
      await Promise.all(
        urls.map((u) => {
          const fid = parseGoogleDriveFileIdFromUrl(u);
          return fid ? deleteFile(fid) : Promise.resolve();
        })
      );
      return NextResponse.json({ ok: true });
    }

    const post = await prisma.boardPost.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, attachments: true },
    });
    if (!post || !post.deletedAt) {
      return NextResponse.json({ error: "삭제된 게시물만 처리할 수 있습니다." }, { status: 400 });
    }

    if (op === "restore") {
      await prisma.boardPost.update({
        where: { id },
        data: { deletedAt: null, deletedById: null },
      });
      return NextResponse.json({ ok: true });
    }

    const urls = safeParseBoardAttachments(post.attachments).map((a) => a.url);
    await prisma.boardPost.delete({ where: { id } });
    console.log("[admin/trash] 게시판 영구 삭제 → Drive 첨부 삭제 시도", {
      postId: id,
      urlCount: urls.length,
    });
    await Promise.all(
      urls.map((u) => {
        const fid = parseGoogleDriveFileIdFromUrl(u);
        return fid ? deleteFile(fid) : Promise.resolve();
      })
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/admin/trash", e);
    return NextResponse.json({ error: "처리에 실패했습니다." }, { status: 500 });
  }
}
