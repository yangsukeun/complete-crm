import "server-only";

import prisma from "@/lib/prisma";
import {
  callAiByProvider,
  getProvider,
  type AIProvider,
  type ChatMessage,
} from "@/lib/ai/assist-client";
import { buildSecretaryDataContext } from "@/lib/ai-secretary/build-context";
import { getSecretaryRolePrompt } from "@/lib/ai-secretary/prompts";

export async function resolveAiProviderForUser(userId: string): Promise<AIProvider> {
  let userPreferred: AIProvider | null = null;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferredAiProvider: true },
    });
    const p = (u as { preferredAiProvider?: string | null } | null)?.preferredAiProvider;
    if (p === "gemini" || p === "openai" || p === "notebook") userPreferred = p;
  } catch {
    /* preferredAiProvider 없을 수 있음 */
  }
  return userPreferred ?? getProvider();
}

function validateDateKey(dateKey: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)");
  }
}

/**
 * assist/route.ts와 동일하게 callAiByProvider 사용 — DB 저장 포함
 */
export async function sendSecretaryMessage(params: {
  userId: string;
  role: string;
  dateKey: string;
  message: string;
  requestedProvider?: AIProvider | null;
}): Promise<{ reply: string }> {
  const { userId, role, dateKey, message, requestedProvider } = params;
  validateDateKey(dateKey);
  const trimmed = message.trim();
  if (!trimmed) throw new Error("메시지가 비어 있습니다.");

  const provider = requestedProvider ?? (await resolveAiProviderForUser(userId));

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const notebookUrl = process.env.NOTEBOOK_LLM_URL?.trim();
  if (provider === "gemini" && !geminiKey) throw new Error("GEMINI_API_KEY가 없습니다.");
  if (provider === "openai" && !openAiKey) throw new Error("OPENAI_API_KEY가 없습니다.");
  if (provider === "notebook" && !notebookUrl) throw new Error("NOTEBOOK_LLM_URL이 없습니다.");

  const conversation = await prisma.$transaction(async (tx) => {
    const conv = await tx.aiConversation.upsert({
      where: { userId_dateKey: { userId, dateKey } },
      create: { userId, dateKey },
      update: {},
    });
    const maxRow = await tx.aiConversationMessage.aggregate({
      where: { conversationId: conv.id },
      _max: { orderIndex: true },
    });
    const nextOrder = (maxRow._max.orderIndex ?? -1) + 1;
    await tx.aiConversationMessage.create({
      data: {
        conversationId: conv.id,
        role: "user",
        content: trimmed,
        orderIndex: nextOrder,
      },
    });
    return conv;
  });

  const history = await prisma.aiConversationMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { orderIndex: "asc" },
  });

  const ctx = await buildSecretaryDataContext({ userId, role, dateKey });
  const rolePrompt = getSecretaryRolePrompt(role);
  const systemContent = `${rolePrompt}\n\n${ctx}\n\n위 데이터는 참고용입니다. 답변은 한국어로 하고, 권한이 없는 정보(역할 기준)는 추측하지 마세요.`;

  const chatMessages: ChatMessage[] = [{ role: "system", content: systemContent }];
  for (const m of history) {
    if (m.role === "user" || m.role === "assistant") {
      chatMessages.push({
        role: m.role as "user" | "assistant",
        content: m.content,
      });
    }
  }

  const reply = await callAiByProvider(provider, chatMessages);

  await prisma.$transaction(async (tx) => {
    const maxRow = await tx.aiConversationMessage.aggregate({
      where: { conversationId: conversation.id },
      _max: { orderIndex: true },
    });
    const nextOrder = (maxRow._max.orderIndex ?? -1) + 1;
    await tx.aiConversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: reply,
        orderIndex: nextOrder,
      },
    });
    await tx.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
  });

  return { reply };
}
