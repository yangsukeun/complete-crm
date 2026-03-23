import "server-only";

import prisma from "@/lib/prisma";
import {
  callAiByProvider,
  getClaudeApiKey,
  getProvider,
  logClaudeEnvForVercel,
  maskApiKeyForLog,
  resolveProviderWithAvailableKeys,
  type AIProvider,
  type ChatMessage,
} from "@/lib/ai/assist-client";
import { buildSecretaryDataContext } from "@/lib/ai-secretary/build-context";
import { getSecretaryRolePrompt, isExecutiveLike } from "@/lib/ai-secretary/prompts";

export async function resolveAiProviderForUser(userId: string): Promise<AIProvider> {
  let userPreferred: AIProvider | null = null;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferredAiProvider: true },
    });
    const p = (u as { preferredAiProvider?: string | null } | null)?.preferredAiProvider;
    if (p === "gemini" || p === "openai" || p === "notebook" || p === "claude") userPreferred = p;
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

type KeyFlags = { gemini: boolean; openai: boolean; claude: boolean; notebook: boolean };

/**
 * 라우트에서 `AI_PROVIDER`로 고정된 경우: 다른 프로바이더로 폴백하지 않음.
 * (폴백 시 Gemini로만 나가고 Claude 호출이 안 되는 문제·잘못된 503/502 혼선 방지)
 */
function assertKeysForProvider(provider: AIProvider, keys: KeyFlags): void {
  if (provider === "gemini" && !keys.gemini) throw new Error("GEMINI_API_KEY가 없습니다.");
  if (provider === "openai" && !keys.openai) throw new Error("OPENAI_API_KEY가 없습니다.");
  if (provider === "claude" && !keys.claude) {
    throw new Error("CLAUDE_API_KEY(또는 ANTHROPIC_API_KEY)가 없습니다.");
  }
  if (provider === "notebook" && !keys.notebook) throw new Error("NOTEBOOK_LLM_URL이 없습니다.");
}

/** Vercel 로그 길이 제한 대비 — 긴 system 프롬프트를 나눠 출력 */
function logAiSecretarySystemPrompt(systemContent: string, meta: { userId: string; role: string; dateKey: string }) {
  const tag = "[AI secretary] system prompt";
  const debugFull =
    process.env.DEBUG_AI_SECRETARY_SYSTEM === "1" || process.env.NODE_ENV === "development";

  const emailLike = /@|이메일:|email:/i.test(systemContent);
  console.log(`${tag} (meta)`, {
    ...meta,
    charLength: systemContent.length,
    contextLikelyHasEmailField: emailLike,
  });

  if (debugFull) {
    const chunkSize = 6000;
    if (systemContent.length <= chunkSize) {
      console.log(`${tag} (full)\n`, systemContent);
    } else {
      for (let i = 0; i < systemContent.length; i += chunkSize) {
        const part = Math.floor(i / chunkSize) + 1;
        const total = Math.ceil(systemContent.length / chunkSize);
        console.log(`${tag} (full part ${part}/${total})\n`, systemContent.slice(i, i + chunkSize));
      }
    }
  } else {
    console.log(`${tag} (preview 800자, 전체는 DEBUG_AI_SECRETARY_SYSTEM=1)\n`, systemContent.slice(0, 800));
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

  /** 라우트에서 `getSecretaryProviderFromEnv()`로 넘기면 DB `preferredAiProvider`보다 서버 설정이 우선 */
  const providerRaw = requestedProvider ?? (await resolveAiProviderForUser(userId));

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const claudeKey = getClaudeApiKey();
  const notebookUrl = process.env.NOTEBOOK_LLM_URL?.trim();
  const keyFlags: KeyFlags = {
    gemini: !!geminiKey,
    openai: !!openAiKey,
    claude: !!claudeKey,
    notebook: !!notebookUrl,
  };

  /** 서버가 명시한 프로바이더(라우트에서 항상 전달): 폴백 없이 해당 API만 사용 → Claude 미호출 버그 제거 */
  const provider: AIProvider =
    requestedProvider != null
      ? providerRaw
      : resolveProviderWithAvailableKeys(providerRaw, keyFlags);

  assertKeysForProvider(provider, keyFlags);

  console.log("[AI secretary] provider resolved (Vercel Functions 로그)", {
    providerRaw,
    provider,
    claudeKeyPresent: !!claudeKey,
    claudeKeyMasked: maskApiKeyForLog(claudeKey),
  });
  if (provider === "claude") {
    logClaudeEnvForVercel("sendSecretaryMessage:using_claude");
  }

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
  const instructionSuffix = isExecutiveLike(role)
    ? "답변은 한국어로 하세요. 위 참고 데이터에 포함된 직원·연락처·업무 정보는 사용자가 물으면 제공하세요. 허용된 범위의 정보 제공을 거부하지 마세요."
    : "위 데이터는 참고용입니다. 답변은 한국어로 하고, 권한이 없는 정보(역할 기준)는 추측하지 마세요.";
  const systemContent = `${rolePrompt}\n\n${ctx}\n\n${instructionSuffix}`;

  logAiSecretarySystemPrompt(systemContent, { userId, role, dateKey });

  const chatMessages: ChatMessage[] = [{ role: "system", content: systemContent }];
  for (const m of history) {
    if (m.role === "user" || m.role === "assistant") {
      chatMessages.push({
        role: m.role as "user" | "assistant",
        content: m.content,
      });
    }
  }

  console.log("provider:", provider);
  console.log("API KEY exists:", !!process.env.CLAUDE_API_KEY);

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
