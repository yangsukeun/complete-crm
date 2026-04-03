import { Suspense } from "react";
import {
  boardPostIsAnonymous,
  fetchBoardPostCommentsDto,
} from "@/lib/board-comments-serialize";
import { BoardPostComments } from "./board-post-comments";

// [PERF-auto] 댓글 스트리밍 — 본문·이력과 별도 서버 컴포넌트 경계로 TTFB·동시성 개선

export async function BoardCommentsSection({
  postId,
  isAnonymous,
  category,
  viewerRole,
}: {
  postId: string;
  isAnonymous: boolean;
  category: string;
  viewerRole: string;
}) {
  const postAnonymous = boardPostIsAnonymous(isAnonymous, category);
  const initialComments = await fetchBoardPostCommentsDto(postId, {
    postAnonymous,
    viewerRole,
  });
  return <BoardPostComments postId={postId} initialComments={initialComments} />;
}

export function BoardCommentsFallback() {
  return (
    <section className="space-y-4" aria-busy="true">
      <div className="flex items-center gap-2">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
    </section>
  );
}

export function BoardCommentsSuspense({
  postId,
  isAnonymous,
  category,
  viewerRole,
}: {
  postId: string;
  isAnonymous: boolean;
  category: string;
  viewerRole: string;
}) {
  return (
    <Suspense fallback={<BoardCommentsFallback />}>
      <BoardCommentsSection
        postId={postId}
        isAnonymous={isAnonymous}
        category={category}
        viewerRole={viewerRole}
      />
    </Suspense>
  );
}
