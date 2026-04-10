import { getAppSession } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { resolveAppModeForUser } from "@/lib/app-mode-server";
import { canUserViewBoardPost } from "@/lib/board-access";
import { boardCategoryIsAnonymous } from "@/lib/board-category";
import { safeParseAttachments } from "@/lib/board-attachments";
import { PageHeadline } from "@/components/page-headline";
import { BoardPostContent } from "./board-post-content";
import { BoardCommentsSuspense } from "./board-comments-loader";
import { BoardPostActions } from "./board-post-actions";
import { BoardPostRevisionHistory } from "./board-post-revision-history";
import { ArrowLeft } from "lucide-react";

/** 로그인·회사 모드 전용 — generateStaticParams 미적용 */
export const dynamic = "force-dynamic";

export default async function BoardPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const appMode = await resolveAppModeForUser(session.user.id, cookieStore);
  if (appMode !== "company") redirect("/choose-mode");

  const { id } = await params;
  // [PERF-auto] 본문과 개정 이력 병렬 조회
  const [post, postRevisions] = await Promise.all([
    prisma.boardPost.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        contentType: true,
        category: true,
        isAnonymous: true,
        workspaceScope: true,
        attachments: true,
        createdAt: true,
        createdById: true,
        deletedAt: true,
        // mentionedUserIds: 일부 DB에 컬럼이 없어 select 제외
        createdBy: { select: { name: true, position: true, role: true } },
      },
    }),
    prisma.boardPostRevision.findMany({
      where: { boardPostId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userName: true,
        changedFields: true,
        legacyPayload: true,
        createdAt: true,
      },
    }),
  ]);
  if (!post) notFound();

  const role = session.user.role ?? "";
  if (
    !canUserViewBoardPost(
      {
        deletedAt: post.deletedAt,
        workspaceScope: post.workspaceScope,
        createdById: post.createdById,
        mentionedUserIds: null,
      },
      session.user.id,
      role
    )
  ) {
    notFound();
  }

  const attachments = safeParseAttachments(post.attachments);

  const isAdmin = role === "TEAM_LEAD" || role === "EXECUTIVE" || role === "ADMIN";
  const postAnonymous = boardCategoryIsAnonymous(post.category);
  const authorForHeadline = postAnonymous
    ? role === "EXECUTIVE"
      ? `익명 (실제: ${post.createdBy?.name ?? "삭제된 사용자"})`
      : "익명"
    : `${post.createdBy?.name ?? "삭제된 사용자"}${post.createdBy?.position ? ` · ${post.createdBy.position}` : ""}`;
  const canEditPost = session.user.id === post.createdById || isAdmin;

  const initialHistoryName =
    postAnonymous && role !== "EXECUTIVE" ? "익명" : post.createdBy?.name ?? "삭제된 사용자";

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex items-center gap-3">
        <Link
          href="/board"
          prefetch={true}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          목록
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeadline
          title={post.title}
          description={`${authorForHeadline} · ${new Date(post.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
        />
        <BoardPostActions
          postId={id}
          canEdit={canEditPost}
          initialTitle={post.title}
          initialDescription={post.description ?? ""}
          initialContentType={post.contentType ?? "text"}
          initialCategory={
            post.category as "COMPANY" | "TRAINING" | "FREE" | "ANONYMOUS" | "MEETING"
          }
          initialAttachments={attachments}
        />
      </div>
      <BoardPostContent
        description={post.description ?? ""}
        contentType={post.contentType ?? "text"}
        attachments={attachments}
        category={post.category}
      />
      <BoardPostRevisionHistory
        edits={postRevisions.map((r) => ({
          id: r.id,
          userName: r.userName,
          createdAt: r.createdAt.toISOString(),
          changedFields: r.changedFields,
          legacyPayload: r.legacyPayload ?? undefined,
        }))}
        initialAuthorName={initialHistoryName}
        initialCreatedAtIso={post.createdAt.toISOString()}
      />
      <BoardCommentsSuspense
        postId={id}
        isAnonymous={postAnonymous}
        category={post.category}
        viewerRole={role}
      />
    </div>
  );
}
