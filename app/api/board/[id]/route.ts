import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canUserViewBoardPost } from "@/lib/board-access";
import { boardCategoryIsAnonymous } from "@/lib/board-category";
import { collectGoogleDriveFileIdsFromText, parseGoogleDriveFileIdFromUrl } from "@/lib/google-drive-url-utils";
import { deleteFile } from "@/lib/storage/google-drive-storage";
import { z } from "zod";

export const runtime = "nodejs";

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

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(50000).optional(),
  category: z.enum(["COMPANY", "TRAINING", "FREE", "ANONYMOUS"]).optional(),
  attachments: z.array(z.object({ url: z.string().min(1), name: z.string().optional() })).max(20).optional(),
});

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
    const role = (session.user as { role?: string }).role ?? "";
    const post = await prisma.boardPost.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true, position: true, role: true } } },
    });
    if (!post) {
      return NextResponse.json({ error: "해당 자료를 찾을 수 없습니다." }, { status: 404 });
    }

    if (
      !canUserViewBoardPost(
        {
          deletedAt: post.deletedAt,
          workspaceScope: post.workspaceScope,
          createdById: post.createdById,
        },
        session.user.id,
        role
      )
    ) {
      return NextResponse.json({ error: "해당 자료를 찾을 수 없습니다." }, { status: 404 });
    }

    const anon = post.isAnonymous || boardCategoryIsAnonymous(post.category);
    const isExec = role === "EXECUTIVE";

    return NextResponse.json({
      id: post.id,
      title: post.title,
      description: post.description ?? "",
      category: post.category,
      isAnonymous: anon,
      workspaceScope: post.workspaceScope,
      attachments: JSON.parse(post.attachments || "[]") as { url: string; name: string }[],
      createdAt: post.createdAt.toISOString(),
      createdById: anon && !isExec ? null : post.createdById,
      createdByName: anon ? "익명" : post.createdBy?.name ?? "삭제된 사용자",
      createdByPosition: anon ? null : post.createdBy?.position ?? null,
    });
  } catch (e) {
    console.error("Board GET [id]:", e);
    return NextResponse.json({ error: "자료를 불러올 수 없습니다." }, { status: 500 });
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
    const post = await prisma.boardPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "해당 자료를 찾을 수 없습니다." }, { status: 404 });
    }

    const role = (session.user as { role?: string }).role ?? "";
    if (
      post.deletedAt ||
      !canUserViewBoardPost(
        {
          deletedAt: post.deletedAt,
          workspaceScope: post.workspaceScope,
          createdById: post.createdById,
        },
        session.user.id,
        role
      )
    ) {
      return NextResponse.json({ error: "해당 자료를 찾을 수 없습니다." }, { status: 404 });
    }

    const isAdmin = role === "TEAM_LEAD" || role === "EXECUTIVE" || role === "ADMIN";
    const isAuthor = post.createdById === session.user.id;
    if (!isAuthor && !isAdmin) {
      return NextResponse.json({ error: "수정 권한이 없습니다." }, { status: 403 });
    }

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: {
      title?: string;
      description?: string | null;
      category?: string;
      isAnonymous?: boolean;
      workspaceScope?: "TEAM" | "PERSONAL";
      attachments?: string;
    } = {};
    let removedAttachmentUrls: string[] = [];
    if (parsed.data.title !== undefined) data.title = parsed.data.title.trim();
    if (parsed.data.description !== undefined) data.description = (parsed.data.description ?? "").trim() || null;
    if (parsed.data.category !== undefined) {
      data.category = parsed.data.category;
      data.isAnonymous = parsed.data.category === "ANONYMOUS";
      if (parsed.data.category === "FREE" || parsed.data.category === "ANONYMOUS") {
        data.workspaceScope = "TEAM";
      }
    }
    if (parsed.data.attachments !== undefined) {
      const oldList = safeParseBoardAttachments(post.attachments);
      const newList = parsed.data.attachments ?? [];
      const newSet = new Set(newList.map((a) => a.url));
      removedAttachmentUrls = oldList.filter((a) => !newSet.has(a.url)).map((a) => a.url);
      data.attachments = JSON.stringify(
        newList.map((a: { url: string; name?: string }) => ({
          url: a.url,
          name: (a.name && a.name.trim()) || "링크",
        }))
      );
    }

    const updated = await prisma.boardPost.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        isAnonymous: true,
        workspaceScope: true,
        attachments: true,
        createdAt: true,
      },
    });

    if (removedAttachmentUrls.length > 0) {
      console.log("[board] PATCH: 첨부 제거로 Drive 삭제", {
        postId: id,
        removedCount: removedAttachmentUrls.length,
      });
      await Promise.all(
        removedAttachmentUrls.map((u) => {
          const fid = parseGoogleDriveFileIdFromUrl(u);
          return fid ? deleteFile(fid) : Promise.resolve();
        })
      );
    }

    return NextResponse.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      attachments: JSON.parse(updated.attachments || "[]"),
      isAnonymous: updated.isAnonymous,
    });
  } catch (e) {
    console.error("Board PATCH:", e);
    return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });
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
    const post = await prisma.boardPost.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "해당 자료를 찾을 수 없습니다." }, { status: 404 });
    }

    const role = (session.user as { role?: string }).role ?? "";
    if (
      post.deletedAt ||
      !canUserViewBoardPost(
        {
          deletedAt: post.deletedAt,
          workspaceScope: post.workspaceScope,
          createdById: post.createdById,
        },
        session.user.id,
        role
      )
    ) {
      return NextResponse.json({ error: "해당 자료를 찾을 수 없습니다." }, { status: 404 });
    }

    const isAdmin = role === "TEAM_LEAD" || role === "EXECUTIVE" || role === "ADMIN";
    if (post.createdById !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
    }

    const attachList = safeParseBoardAttachments(post.attachments);
    const descPreview = (post.description ?? "").slice(0, 200);
    const bodyDriveIds = collectGoogleDriveFileIdsFromText(post.description ?? "");
    const driveIdsToDelete = new Set<string>();
    /** Vercel: 어떤 첨부가 Drive ID로 안 잡혔는지 추적 */
    const attachmentParseLog = attachList.map((a) => ({
      name: a.name?.slice(0, 40),
      urlPreview: a.url.length > 140 ? `${a.url.slice(0, 140)}…` : a.url,
      parsedIdPrefix: parseGoogleDriveFileIdFromUrl(a.url)?.slice(0, 8) ?? null,
    }));

    for (const a of attachList) {
      const fid = parseGoogleDriveFileIdFromUrl(a.url);
      if (fid) driveIdsToDelete.add(fid);
    }
    for (const fid of bodyDriveIds) driveIdsToDelete.add(fid);

    if (driveIdsToDelete.size === 0 && (attachList.length > 0 || /drive|googleusercontent|blob|vercel|webdav/i.test(post.description ?? ""))) {
      console.warn("[board] DELETE(soft): Drive 삭제 대상 ID 없음 — URL 형식이 Drive/File ID 파싱 불가이거나 Blob/WebDAV일 수 있음", {
        postId: id,
        attachmentCount: attachList.length,
        attachmentParseLog,
        bodyRawContainsDriveLike: /drive\.google|googleusercontent/i.test(post.description ?? ""),
        descriptionPreview: descPreview,
      });
    } else if (driveIdsToDelete.size > 0) {
      console.log("[board] DELETE(soft): 소프트삭제 저장 후 deleteFile 호출 예정", {
        postId: id,
        attachmentCount: attachList.length,
        bodyParseIdCount: bodyDriveIds.length,
        uniqueDriveIds: driveIdsToDelete.size,
        idPrefixes: [...driveIdsToDelete].map((x) => x.slice(0, 10) + "…"),
      });
    }

    const now = new Date();
    await prisma.boardPost.update({
      where: { id },
      data: { deletedAt: now, deletedById: session.user.id },
    });

    console.log("[board] DELETE(soft): prisma update 완료 → deleteFile 시작 (각 결과는 [storage] 로그)", {
      postId: id,
      deleteCount: driveIdsToDelete.size,
    });
    for (const fid of driveIdsToDelete) {
      console.log("[board] DELETE(soft): deleteFile 호출", {
        postId: id,
        fileIdPrefix: fid.slice(0, 12) + "…",
        supportsAllDrives: true,
      });
      await deleteFile(fid);
    }
    console.log("[board] DELETE(soft): deleteFile 배치 종료", { postId: id, attempted: driveIdsToDelete.size });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Board DELETE:", e);
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
}
