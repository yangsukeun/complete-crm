import "server-only";

import prisma from "@/lib/prisma";

/**
 * 두 사용자 간 1:1 채팅방 조회 또는 생성.
 * `/api/chats` POST와 동일한 매칭 규칙.
 */
export async function findOrCreateDirectChat(userIdA: string, userIdB: string): Promise<string> {
  const sortedPair = [userIdA, userIdB].sort();
  const [a, b] = sortedPair;

  const candidates = await prisma.chat.findMany({
    where: {
      isGroup: false,
      participants: {
        every: { userId: { in: sortedPair } },
      },
    },
    include: { participants: { select: { userId: true } } },
  });

  for (const chat of candidates) {
    if (chat.participants.length !== 2) continue;
    const ids = chat.participants.map((p) => p.userId).sort().join(",");
    if (ids === `${a},${b}`) return chat.id;
  }

  const created = await prisma.chat.create({
    data: {
      isGroup: false,
      participants: {
        create: [{ userId: userIdA }, { userId: userIdB }],
      },
    },
  });
  return created.id;
}

/** 시스템/서버가 특정 사용자 명의로 DM 전송 (일정 초대 안내 등). CHAT_MESSAGE 알림은 보내지 않음(별도 CRM 알림 사용). */
export async function sendChatMessageFromUser(input: {
  chatId: string;
  fromUserId: string;
  body: string;
}): Promise<void> {
  const body = input.body.trim().slice(0, 2000);
  if (!body) return;
  await prisma.$transaction([
    prisma.chatMessage.create({
      data: { chatId: input.chatId, userId: input.fromUserId, body },
    }),
    prisma.chat.update({
      where: { id: input.chatId },
      data: { updatedAt: new Date() },
    }),
  ]);
}
