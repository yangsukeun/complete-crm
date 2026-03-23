import "server-only";

import prisma from "@/lib/prisma";
import {
  callAiByProvider,
  getClaudeApiKey,
  getProvider,
  logClaudeEnvForVercel,
  maskApiKeyForLog,
  resolveProviderWithAvailableKeys,
  CLAUDE_DEFAULT_MODEL,
  type AIProvider,
  type ChatMessage,
} from "@/lib/ai/assist-client";
import { buildSecretaryDataContext } from "@/lib/ai-secretary/build-context";
import { getSecretaryRolePrompt, isExecutiveLike } from "@/lib/ai-secretary/prompts";

// ─── Tool definitions ────────────────────────────────────────────────────────

const SECRETARY_TOOLS = [
  {
    name: "create_schedule",
    description:
      "사용자의 캘린더에 새 일정을 등록합니다. 일정·스케줄 등록 요청이 오면 반드시 이 도구를 사용하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "일정 제목" },
        startTime: {
          type: "string",
          description: "시작 시간 (ISO 8601, 예: 2025-03-24T09:00:00+09:00)",
        },
        endTime: {
          type: "string",
          description: "종료 시간 (ISO 8601, 예: 2025-03-24T10:00:00+09:00)",
        },
        description: { type: "string", description: "일정 설명 (선택)" },
        isAllDay: { type: "boolean", description: "종일 일정 여부 (기본값: false)" },
      },
      required: ["title", "startTime", "endTime"],
    },
  },
  {
    name: "create_task",
    description:
      "새 업무(Task)를 생성합니다. 업무·할 일 생성 요청이 오면 반드시 이 도구를 사용하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "업무 제목" },
        description: { type: "string", description: "업무 설명 (선택)" },
        dueDate: {
          type: "string",
          description: "마감일 (YYYY-MM-DD, 예: 2025-03-24)",
        },
      },
      required: ["title", "dueDate"],
    },
  },
] as const;

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    if (name === "create_schedule") {
      const { title, startTime, endTime, description, isAllDay } = input as {
        title: string;
        startTime: string;
        endTime: string;
        description?: string;
        isAllDay?: boolean;
      };
      const schedule = await prisma.schedule.create({
        data: {
          title,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          description: description ?? null,
          isAllDay: isAllDay ?? false,
          userId,
          scope: "PERSONAL",
        },
      });
      const fmt = (d: Date) =>
        new Intl.DateTimeFormat("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(d);
      return `✅ 일정이 등록되었습니다.\n- 제목: ${schedule.title}\n- 시작: ${fmt(schedule.startTime)}\n- 종료: ${fmt(schedule.endTime)}`;
    }

    if (name === "create_task") {
      const { title, description, dueDate } = input as {
        title: string;
        description?: string;
        dueDate: string;
      };
      const task = await prisma.task.create({
        data: {
          title,
          description: description ?? null,
          dueDate: new Date(`${dueDate}T00:00:00+09:00`),
          assignedToId: userId,
          createdById: userId,
          status: "TODO",
          isCompleted: false,
          scope: "PERSONAL",
        },
      });
      return `✅ 업무가 생성되었습니다.\n- 제목: ${task.title}\n- 마감: ${dueDate}`;
    }

    return `알 수 없는 도구: ${name}`;
  } catch (e) {
    return `도구 실행 실패 (${name}): ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ─── Anthropic tool-use loop ─────────────────────────────────────────────────

type AnthropicContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

type AnthropicMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "user"; content: { type: "tool_result"; tool_use_id: string; content: string }[] }
  | { role: "assistant"; content: AnthropicContent[] };

async function callAnthropicWithToolLoop(
  apiKey: string,
  systemPrompt: string,
  messages: AnthropicMessage[],
  userId: string
): Promise<string> {
  const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
  const model = process.env.CLAUDE_MODEL?.trim() || CLAUDE_DEFAULT_MODEL;
  const maxTokens = Math.max(1, Number(process.env.CLAUDE_MAX_TOKENS) || 1000);
  const headerKey = (process.env.CLAUDE_API_KEY ?? "").trim() || apiKey;

  const currentMessages = [...messages];
  const MAX_LOOPS = 5;

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    // 첫 번째 루프에서 사용자 메시지에 일정/업무 관련 키워드가 있으면 tool_choice: "any"로 강제.
    // 일반 대화(인사, 질문 등)는 "auto"로 유지.
    let toolChoice: { type: string } = { type: "auto" };
    if (loop === 0) {
      const lastMsg = [...currentMessages].reverse().find((m) => m.role === "user");
      const msgText = typeof lastMsg?.content === "string" ? lastMsg.content : "";
      const ACTION_KEYWORDS = [
        "일정", "스케줄", "회의", "약속", "캘린더", "등록해", "추가해", "잡아줘", "잡아 줘",
        "업무", "태스크", "task", "할 일", "할일", "생성해", "만들어",
      ];
      if (ACTION_KEYWORDS.some((k) => msgText.includes(k))) {
        toolChoice = { type: "any" };
      }
    }
    const body = {
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      system: systemPrompt,
      tools: SECRETARY_TOOLS,
      tool_choice: toolChoice,
      messages: currentMessages,
    };

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": headerKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`Claude API 오류 (${res.status}): ${raw.slice(0, 300)}`);
    }

    const data = JSON.parse(raw) as {
      stop_reason: string;
      content: AnthropicContent[];
    };

    if (data.stop_reason !== "tool_use") {
      // 최종 텍스트 응답
      const text = data.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n\n")
        .trim();
      return text || "응답을 생성하지 못했습니다.";
    }

    // tool_use 처리
    const toolUseBlocks = data.content.filter(
      (c): c is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        c.type === "tool_use"
    );

    // assistant 메시지 추가
    currentMessages.push({ role: "assistant", content: data.content });

    // 도구 실행 후 tool_result 메시지 추가
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => ({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: await executeTool(block.name, block.input, userId),
      }))
    );
    currentMessages.push({ role: "user", content: toolResults });
  }

  return "요청을 처리하지 못했습니다.";
}

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
    : "답변은 한국어로 하세요. 일정 등록·업무 생성 요청은 반드시 도구를 사용해 즉시 실행하세요. 권한이 없는 정보(연락처·재무 등)만 거부하세요.";
  const systemContent = `${rolePrompt}\n\n${ctx}\n\n${instructionSuffix}`;

  logAiSecretarySystemPrompt(systemContent, { userId, role, dateKey });

  console.log("provider:", provider);
  console.log("API KEY exists:", !!process.env.CLAUDE_API_KEY);

  let reply: string;
  if (provider === "claude") {
    // Claude: tool use 루프 (일정 등록, 업무 생성 실제 실행)
    const toolMessages: AnthropicMessage[] = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    reply = await callAnthropicWithToolLoop(
      getClaudeApiKey(),
      systemContent,
      toolMessages,
      userId
    );
  } else {
    // 기타 프로바이더: 일반 텍스트 응답
    const chatMessages: ChatMessage[] = [{ role: "system", content: systemContent }];
    for (const m of history) {
      if (m.role === "user" || m.role === "assistant") {
        chatMessages.push({ role: m.role as "user" | "assistant", content: m.content });
      }
    }
    reply = await callAiByProvider(provider, chatMessages);
  }

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
