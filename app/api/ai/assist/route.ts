import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import {
  type AIProvider,
  type ChatMessage,
  callAiByProvider,
  getClaudeApiKey,
  resolveProviderWithAvailableKeys,
} from "@/lib/ai/assist-client";
import { sendSecretaryMessage } from "@/lib/ai-secretary/run-chat";

const ACTION_PROMPTS: Record<
  string,
  { system: string; user: (text: string, topic?: string) => string }
> = {
  auto: {
    system:
      "당신은 회사 내부 글쓰기를 돕는 AI 비서입니다. 주어진 주제나 키워드로 한국어 초안을 간결하고 전문적으로 작성합니다. 불필요한 수식은 줄이고, 요점만 담아 2~4문단 이내로 작성합니다.",
    user: (_, topic) =>
      topic?.trim()
        ? `다음 주제로 글 초안을 작성해 주세요. 제목/키워드만 있어도 됩니다.\n\n주제: ${topic}`
        : "회사 공지나 업무 요약에 쓸 수 있는 짧은 초안을 작성해 주세요. (주제를 입력하면 더 정확합니다)",
  },
  expand: {
    system:
      "당신은 글쓰기 조수입니다. 사용자가 준 짧은 문장을 바탕으로 내용을 풍부하게 확장합니다. 한국어로만 답하고, 원문의 톤과 의도를 유지합니다.",
    user: (text: string) => `다음 내용을 2~3배 길이로 확장해 주세요. 핵심은 유지합니다.\n\n${text}`,
  },
  shorten: {
    system:
      "당신은 요약 전문가입니다. 주어진 글을 핵심만 남겨 짧게 요약합니다. 한국어로만 답합니다.",
    user: (text: string) => `다음 내용을 핵심만 남겨 2~3문장으로 요약해 주세요.\n\n${text}`,
  },
  formal: {
    system:
      "당신은 문어체·경어 변환 전문가입니다. 주어진 글을 정중하고 격식 있는 톤(존댓말, ~합니다체)으로 바꿉니다. 한국어로만 답합니다.",
    user: (text: string) => `다음 내용을 정중한 격식체(합니다체)로 바꿔 주세요.\n\n${text}`,
  },
  casual: {
    system:
      "당신은 말투 변환 전문가입니다. 주어진 글을 부드러운 구어체(~해요, ~네요)로 바꿉니다. 한국어로만 답합니다.",
    user: (text: string) => `다음 내용을 친근한 구어체(해요체)로 바꿔 주세요.\n\n${text}`,
  },
  translate_en: {
    system:
      "You are a translator. Translate the given Korean text into natural English. Output only the translation, no explanation.",
    user: (text: string) => `Translate to English:\n\n${text}`,
  },
};

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const bodyProvider = body.provider;
    const requestedProvider =
      bodyProvider === "gemini" ||
      bodyProvider === "openai" ||
      bodyProvider === "notebook" ||
      bodyProvider === "claude"
        ? bodyProvider
        : null;

    let userPreferred: AIProvider | null = null;
    try {
      const u = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { preferredAiProvider: true },
      });
      const p = (u as { preferredAiProvider?: string | null } | null)?.preferredAiProvider;
      if (p === "gemini" || p === "openai" || p === "notebook" || p === "claude") userPreferred = p;
    } catch {
      // preferredAiProvider 컬럼 없을 수 있음
    }

    const providerRaw: AIProvider = requestedProvider ?? userPreferred ?? "gemini";

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const openAiKey = process.env.OPENAI_API_KEY?.trim();
    const claudeKey = getClaudeApiKey();
    const notebookUrl = process.env.NOTEBOOK_LLM_URL?.trim();

    const provider = resolveProviderWithAvailableKeys(providerRaw, {
      gemini: !!geminiKey,
      openai: !!openAiKey,
      claude: !!claudeKey,
      notebook: !!notebookUrl,
    });

    if (provider === "gemini" && !geminiKey) {
      return NextResponse.json(
        { error: "Gemini를 사용하려면 .env에 GEMINI_API_KEY를 설정하세요." },
        { status: 503 }
      );
    }
    if (provider === "openai" && !openAiKey) {
      return NextResponse.json(
        { error: "GPT를 사용하려면 .env에 OPENAI_API_KEY를 설정하세요." },
        { status: 503 }
      );
    }
    if (provider === "claude" && !claudeKey) {
      return NextResponse.json(
        { error: "Claude를 사용하려면 .env에 CLAUDE_API_KEY(또는 ANTHROPIC_API_KEY)를 설정하세요." },
        { status: 503 }
      );
    }
    if (provider === "notebook") {
      if (!notebookUrl) {
        return NextResponse.json(
          {
            error:
              "노트북 LLM을 사용하려면 .env에 NOTEBOOK_LLM_URL을 설정하세요. (예: http://localhost:11434/v1 — Ollama)",
          },
          { status: 503 }
        );
      }
    }
    const action = typeof body.action === "string" ? body.action.trim() : "";

    if (action === "secretary_chat") {
      const dateKey = typeof body.dateKey === "string" ? body.dateKey.trim() : "";
      const secMsg = typeof body.message === "string" ? body.message : "";
      try {
        const { reply } = await sendSecretaryMessage({
          userId: session.user.id,
          role: session.user.role ?? "USER",
          dateKey,
          message: secMsg,
          requestedProvider,
        });
        return NextResponse.json({ text: reply });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "오류";
        if (msg.includes("비어") || msg.includes("형식")) {
          return NextResponse.json({ error: msg }, { status: 400 });
        }
        if (
          msg.includes("API_KEY") ||
          msg.includes("NOTEBOOK_LLM") ||
          msg.includes("ANTHROPIC") ||
          msg.includes("CLAUDE_API")
        ) {
          return NextResponse.json({ error: msg }, { status: 503 });
        }
        console.error("[AI assist] secretary_chat", e);
        return NextResponse.json(
          { error: `AI 처리 중 오류가 발생했습니다. ${msg} API 키·URL과 한도를 확인하세요.` },
          { status: 502 }
        );
      }
    }

    const text = typeof body.text === "string" ? body.text : "";
    const topic = typeof body.topic === "string" ? body.topic : undefined;
    const chatMessage = typeof body.message === "string" ? body.message.trim() : "";
    const chatHistory = Array.isArray(body.messages)
      ? body.messages
          .filter(
            (m: unknown) =>
              typeof m === "object" &&
              m !== null &&
              "role" in m &&
              "content" in m &&
              (m as { role: string }).role in { user: 1, assistant: 1 } &&
              typeof (m as { content: unknown }).content === "string"
          )
          .map((m: { role: string; content: string }) => ({
            role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
            content: String(m.content),
          }))
      : [];

    let messages: ChatMessage[];

    if (action === "chat") {
      const systemContent =
        "당신은 COMPLETE CRM의 AI 비서입니다. 업무 질문, 일정 안내, 문서 작성, 요약, 번역 등 모든 업무 관련 요청에 적극적으로 답변합니다. 한국어로 답하세요.";
      let historySlice = chatHistory
        .slice(-20)
        .map((m: { role: "user" | "assistant"; content: string }) => ({
          role: m.role,
          content: m.content,
        }));
      if (historySlice.length === 0 && chatMessage) {
        historySlice = [
          ...historySlice,
          { role: "user" as const, content: chatMessage || "(빈 메시지)" },
        ];
      }
      messages = [{ role: "system", content: systemContent }, ...historySlice];
    } else {
      const promptConfig = ACTION_PROMPTS[action];
      if (!promptConfig) {
        return NextResponse.json(
          { error: "지원하지 않는 작업입니다. action: auto, expand, shorten, formal, casual, translate_en, chat" },
          { status: 400 }
        );
      }
      const userMessage = promptConfig.user(text, topic);
      messages = [
        { role: "system", content: promptConfig.system },
        { role: "user", content: userMessage },
      ];
    }

    let content: string;
    try {
      content = await callAiByProvider(provider, messages);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "API 오류";
      const errorDetail = {
        route: "/api/ai/assist",
        provider,
        message: e instanceof Error ? e.message : String(e),
        name: e instanceof Error ? e.name : typeof e,
        stack: e instanceof Error ? e.stack : undefined,
        ...(provider === "gemini" && {
          geminiModel: process.env.GEMINI_MODEL?.trim() || "(env 미설정 → 코드 기본값)",
          hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
        }),
        ...(provider === "openai" && {
          hasOpenAiApiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
        }),
        ...(provider === "claude" && {
          claudeModel: process.env.CLAUDE_MODEL?.trim() || "(env 미설정 → 코드 기본값)",
          hasClaudeApiKey: Boolean(getClaudeApiKey()),
        }),
        ...(provider === "notebook" && {
          notebookLlmUrlSet: Boolean(process.env.NOTEBOOK_LLM_URL?.trim()),
        }),
      };
      // Vercel → Project → Logs 에서 [AI assist] 로 검색
      console.log("[AI assist] AI API 호출 실패 (상세)", JSON.stringify(errorDetail, null, 2));
      console.error("[AI assist] AI API 호출 실패", errorDetail);

      return NextResponse.json(
        { error: `AI 처리 중 오류가 발생했습니다. ${msg} API 키·URL과 한도를 확인하세요.` },
        { status: 502 }
      );
    }

    return NextResponse.json({ text: content });
  } catch (e) {
    console.error("[AI assist]", e);
    return NextResponse.json(
      { error: "AI 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
