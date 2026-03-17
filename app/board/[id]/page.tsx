import { getAppSession } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { PageHeadline } from "@/components/page-headline";
import { BoardPostContent } from "./board-post-content";
import { BoardPostComments } from "./board-post-comments";
import { BoardPostActions } from "./board-post-actions";
import { ArrowLeft } from "lucide-react";

export default async function BoardPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const appMode = cookieStore.get("app_mode")?.value;
  if (appMode !== "company") redirect("/choose-mode");

  const { id } = await params;
  const post = await prisma.boardPost.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true, position: true } } },
  });
  if (!post) notFound();

  const attachments = (() => {
    try {
      return JSON.parse(post.attachments || "[]") as { url: string; name: string }[];
    } catch {
      return [];
    }
  })();

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex items-center gap-3">
        <Link
          href="/board"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          목록
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeadline
          title={post.title}
          description={`${post.createdBy?.name ?? "삭제된 사용자"}${post.createdBy?.position ? ` · ${post.createdBy.position}` : ""} · ${new Date(post.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
        />
        <BoardPostActions
          postId={id}
          createdById={post.createdById}
          currentUserId={session.user.id}
          isAdmin={session.user.role === "TEAM_LEAD" || session.user.role === "EXECUTIVE" || session.user.role === "ADMIN"}
          initialTitle={post.title}
          initialDescription={post.description ?? ""}
          initialCategory={post.category as "COMPANY" | "TRAINING"}
          initialAttachments={attachments}
        />
      </div>
      <BoardPostContent
        description={post.description ?? ""}
        attachments={attachments}
        category={post.category}
      />
      <BoardPostComments postId={id} />
    </div>
  );
}
