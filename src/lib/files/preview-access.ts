import prisma from "@/lib/prisma";
import { safeParseAttachments } from "@/lib/board-attachments";
import {
  collectGoogleDriveFileIdsFromText,
  parseGoogleDriveFileIdFromUrl,
} from "@/lib/google-drive-url-utils";
import { canUserViewBoardPost } from "@/lib/board-access";
import { userCanAccessProject } from "@/lib/project-access";

export type AttachmentPreviewContext =
  | { type: "board"; postId: string }
  | { type: "project"; projectId: string }
  | { type: "chat"; chatId: string };

export class FilePreviewForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "FilePreviewForbiddenError";
  }
}

export class FilePreviewNotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "FilePreviewNotFoundError";
  }
}

export function parseAttachmentPreviewContext(sp: URLSearchParams): AttachmentPreviewContext | null {
  const t = (sp.get("context") ?? sp.get("ctx") ?? "").trim().toLowerCase();
  const postId = sp.get("postId")?.trim();
  const projectId = sp.get("projectId")?.trim();
  const chatId = sp.get("chatId")?.trim();
  if (t === "board" && postId) return { type: "board", postId };
  if (t === "project" && projectId) return { type: "project", projectId };
  if (t === "chat" && chatId) return { type: "chat", chatId };
  return null;
}

/**
 * 게시글/프로젝트 본문 첨부에 해당 Drive 파일이 포함되는지 및 사용자 접근 가능 여부.
 */
export async function assertUserCanAccessDriveAttachment(
  userId: string,
  role: string | undefined,
  email: string | undefined,
  driveFileId: string,
  ctx: AttachmentPreviewContext
): Promise<{ originalName: string }> {
  if (ctx.type === "board") {
    const post = await prisma.boardPost.findUnique({
      where: { id: ctx.postId },
      select: {
        attachments: true,
        description: true,
        deletedAt: true,
        workspaceScope: true,
        createdById: true,
        mentionedUserIds: true,
      },
    });
    if (!post) throw new FilePreviewNotFoundError();
    if (!canUserViewBoardPost(post, userId, role ?? "")) throw new FilePreviewForbiddenError();
    const atts = safeParseAttachments(post.attachments);
    const hit = atts.find((a) => parseGoogleDriveFileIdFromUrl(a.url) === driveFileId);
    if (hit) return { originalName: hit.name };

    const bodyIds = collectGoogleDriveFileIdsFromText(post.description ?? "");
    if (bodyIds.includes(driveFileId)) {
      return { originalName: "본문 링크" };
    }

    throw new FilePreviewForbiddenError();
  }

  if (ctx.type === "chat") {
    const r = role ?? "";
    const isElevated = r === "ADMIN" || r === "EXECUTIVE" || r === "TEAM_LEAD";
    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId: ctx.chatId, userId },
      select: { id: true },
    });
    if (!participant && !isElevated) throw new FilePreviewForbiddenError();

    const chat = await prisma.chat.findUnique({
      where: { id: ctx.chatId },
      select: { id: true },
    });
    if (!chat) throw new FilePreviewNotFoundError();

    // 메시지 본문에 해당 Drive fileId가 포함된 경우만 허용
    const hit = await prisma.chatMessage.findFirst({
      where: { chatId: ctx.chatId, body: { contains: driveFileId } },
      select: { id: true },
    });
    if (!hit) throw new FilePreviewForbiddenError();
    return { originalName: "채팅 파일" };
  }

  const ok = await userCanAccessProject(userId, ctx.projectId, { role, email });
  if (!ok) throw new FilePreviewForbiddenError();

  const project = await prisma.project.findFirst({
    where: { id: ctx.projectId, deletedAt: null },
    select: { description: true },
  });
  if (!project) throw new FilePreviewNotFoundError();

  const raw = project.description ?? "";
  let atts: { url: string; name: string }[] = [];
  try {
    const j = JSON.parse(raw) as unknown;
    if (Array.isArray(j)) {
      atts = j
        .filter((x): x is { url?: string; name?: string } => x != null && typeof x === "object")
        .map((x) => ({
          url: typeof x.url === "string" ? x.url : "",
          name: typeof x.name === "string" ? x.name : "파일",
        }))
        .filter((x) => x.url.length > 0);
    }
  } catch {
    atts = [];
  }
  const hit = atts.find((a) => parseGoogleDriveFileIdFromUrl(a.url) === driveFileId);
  if (hit) return { originalName: hit.name };

  const idsInBody = new Set(collectGoogleDriveFileIdsFromText(raw));
  if (idsInBody.has(driveFileId)) {
    return { originalName: "본문 링크" };
  }

  throw new FilePreviewForbiddenError();
}
