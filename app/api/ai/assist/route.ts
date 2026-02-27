import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_DEFAULT_MODEL = "gemini-1.5-flash";
const NOTEBOOK_LLM_DEFAULT_MODEL = "llama3.2";

export type AIProvider = "gemini" | "openai" | "notebook";

function getProvider(): AIProvider {
  const raw = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
  if (raw === "openai" || raw === "gpt") return "openai";
  if (raw === "notebook" || raw === "local" || raw === "ollama") return "notebook";
  return "gemini";
}

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
    user: (text) => `다음 내용을 2~3배 길이로 확장해 주세요. 핵심은 유지합니다.\n\n${text}`,
  },
  shorten: {
    system:
      "당신은 요약 전문가입니다. 주어진 글을 핵심만 남겨 짧게 요약합니다. 한국어로만 답합니다.",
    user: (text) => `다음 내용을 핵심만 남겨 2~3문장으로 요약해 주세요.\n\n${text}`,
  },
  formal: {
    system:
      "당신은 문어체·경어 변환 전문가입니다. 주어진 글을 정중하고 격식 있는 톤(존댓말, ~합니다체)으로 바꿉니다. 한국어로만 답합니다.",
    user: (text) => `다음 내용을 정중한 격식체(합니다체)로 바꿔 주세요.\n\n${text}`,
  },
  casual: {
    system:
      "당신은 말투 변환 전문가입니다. 주어진 글을 부드러운 구어체(~해요, ~네요)로 바꿉니다. 한국어로만 답합니다.",
    user: (text) => `다음 내용을 친근한 구어체(해요체)로 바꿔 주세요.\n\n${text}`,
  },
  translate_en: {
    system:
      "You are a translator. Translate the given Korean text into natural English. Output only the translation, no explanation.",
    user: (text) => `Translate to English:\n\n${text}`,
  },
};

type Message = { role: "system" | "user" | "assistant"; content: string };

async function callGemini(
  apiKey: string,
  messages: Message[]
): Promise<string> {
  const model = process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
  const systemMessage = messages.find((m: any) => m.role === "system");
  const rest = messages.filter((m: any) => m.role !== "system");
  const contents = rest.map((m: any) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.5,
    },
  };
  if (systemMessage?.content) {
    body.systemInstruction = { parts: [{ text: systemMessage.content }] };
  }
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[AI assist] Gemini error", res.status, errText);
    throw new Error("Gemini API 오류");
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  if (!text) throw new Error("Gemini가 내용을 생성하지 못했습니다.");
  return text;
}

async function callOpenAI(apiKey: string, messages: Message[]): Promise<string> {
  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      max_tokens: 1024,
      temperature: 0.5,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[AI assist] OpenAI error", res.status, errText);
    throw new Error("OpenAI API 오류");
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("AI가 내용을 생성하지 못했습니다.");
  return content;
}

/** 노트북 LLM: Ollama, LM Studio 등 OpenAI 호환 로컬 엔드포인트 */
async function callNotebookLLM(baseUrl: string, messages: Message[]): Promise<string> {
  const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
  const model = process.env.NOTEBOOK_LLM_MODEL?.trim() || NOTEBOOK_LLM_DEFAULT_MODEL;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1024,
      temperature: 0.5,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[AI assist] Notebook LLM error", res.status, errText);
    throw new Error("노트북 LLM 연결 오류");
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("노트북 LLM이 내용을 생성하지 못했습니다.");
  return content;
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const bodyProvider = body.provider;
    const requestedProvider =
      bodyProvider === "gemini" || bodyProvider === "openai" || bodyProvider === "notebook"
        ? bodyProvider
        : null;

    let userPreferred: AIProvider | null = null;
    try {
      const u = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { preferredAiProvider: true },
      });
      const p = (u as { preferredAiProvider?: string | null } | null)?.preferredAiProvider;
      if (p === "gemini" || p === "openai" || p === "notebook") userPreferred = p;
    } catch {
      // preferredAiProvider 컬럼 없을 수 있음
    }

    const serverDefault = getProvider();
    const provider: AIProvider =
      requestedProvider ?? userPreferred ?? serverDefault;

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const openAiKey = process.env.OPENAI_API_KEY?.trim();
    const notebookUrl = process.env.NOTEBOOK_LLM_URL?.trim();

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
          .map((m: any) => ({
            role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
            content: String(m.content),
          }))
      : [];

    let messages: Message[];

    if (action === "chat") {
      const systemContent =
        "당신은 COMPLETE CRM의 AI 비서입니다. 회사 내부 글쓰기, 요약, 확장, 톤 변경, 번역 등 글쓰기 관련 요청에 친절하고 전문적으로 답합니다. 한국어로 답하며, 요청이 불명확하면 한두 가지 예시를 들어 확인합니다.";
        const historySlice = chatHistory.slice(-20).map((m: any) => ({ role: m.role, content: m.content }));
      if (historySlice.length === 0 && chatMessage) {
        historySlice.push({ role: "user" as const, content: chatMessage || "(빈 메시지)" });
      }
      messages = [
        { role: "system", content: systemContent },
        ...historySlice,
      ];
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
      if (provider === "gemini") {
        content = await callGemini(geminiKey!, messages);
      } else if (provider === "openai") {
        content = await callOpenAI(openAiKey!, messages);
      } else {
        content = await callNotebookLLM(notebookUrl!, messages);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "API 오류";
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
