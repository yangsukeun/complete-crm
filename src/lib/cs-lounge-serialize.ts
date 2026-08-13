import prisma from "@/lib/prisma";

export async function loadLoungeViewer(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, department: true, name: true },
  });
}

export const loungePostSelect = {
  id: true,
  type: true,
  content: true,
  nickname: true,
  createdAt: true,
  authorId: true,
  votes: { select: { userId: true, value: true } },
} as const;

export const noticePostSelect = {
  ...loungePostSelect,
  author: { select: { name: true } },
} as const;

type VoteRow = { userId: string; value: "LIKE" | "DISLIKE" };

export function serializeLoungePost(
  row: {
    id: string;
    type: "NOTICE" | "LOUNGE";
    content: string;
    nickname: string | null;
    createdAt: Date;
    authorId: string;
    authorName?: string | null;
    votes: VoteRow[];
  },
  viewerId: string
) {
  const likeCount = row.votes.filter((v) => v.value === "LIKE").length;
  const dislikeCount = row.votes.filter((v) => v.value === "DISLIKE").length;
  const mine = row.votes.find((v) => v.userId === viewerId);
  const base = {
    id: row.id,
    type: row.type,
    content: row.content,
    nickname: row.type === "LOUNGE" ? row.nickname : null,
    createdAt: row.createdAt.toISOString(),
    likeCount,
    dislikeCount,
    myVote: mine?.value ?? null,
    isMine: row.authorId === viewerId,
  };
  if (row.type === "NOTICE") {
    return { ...base, authorName: row.authorName ?? null };
  }
  return base;
}
