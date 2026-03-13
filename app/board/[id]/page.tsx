import { getAppSession } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { PageHeadline } from "@/components/page-headline";
import { BoardPostContent } from "./board-post-content";
import { BoardPostComments } from "./board-post-comments";
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
      <PageHeadline
        title={post.title}
        description={`${post.createdBy.name}${post.createdBy.position ? ` · ${post.createdBy.position}` : ""} · ${new Date(post.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
      />
      <BoardPostContent
        description={post.description ?? ""}
        attachments={attachments}
        category={post.category}
      />
      <BoardPostComments postId={id} />
    </div>
  );
}
