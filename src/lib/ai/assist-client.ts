/** assist/route.ts · delegate-task에서 공통 사용 — AI_PROVIDER·키 동일 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** Google이 모델 ID를 바꾸는 경우가 있어, 404 시 아래 순으로 한 번씩 재시도 */
const GEMINI_MODEL_FALLBACKS = ["gemini-1.5-flash", "gemini-2.5-flash-lite"] as const;
export const GEMINI_DEFAULT_MODEL = "gemini-1.5-flash";
/** Anthropic 대시보드/문서의 모델 ID — `CLAUDE_MODEL`로 덮어씀 */
export const CLAUDE_DEFAULT_MODEL = "claude-3-5-sonnet-20241022";
const NOTEBOOK_LLM_DEFAULT_MODEL = "llama3.2";

export type AIProvider = "gemini" | "openai" | "notebook" | "claude";

/** `.env` 기준 권장: `CLAUDE_API_KEY`. 호환용으로 `ANTHROPIC_API_KEY`도 허용 */
export function getClaudeApiKey(): string {
  return (process.env.CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "").trim();
}

export function getProvider(): AIProvider {
  const raw = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
  if (raw === "openai" || raw === "gpt") return "openai";
  if (raw === "notebook" || raw === "local" || raw === "ollama") return "notebook";
  if (raw === "claude" || raw === "anthropic") return "claude";
  return "gemini";
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function parseGeminiApiError(status: number, errText: string): string {
  try {
    const j = JSON.parse(errText) as { error?: { message?: string; status?: string } };
    const msg = j?.error?.message;
    if (msg) return `Gemini API 오류 (${status}): ${msg}`;
  } catch {
    /* ignore */
  }
  const short = errText.length > 200 ? errText.slice(0, 200) + "…" : errText;
  return `Gemini API 오류 (${status})${short ? `: ${short}` : ""}`;
}

export async function callGemini(apiKey: string, messages: ChatMessage[]): Promise<string> {
  const systemMessage = messages.find((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const contents = rest.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.3,
    },
  };
  if (systemMessage?.content) {
    body.systemInstruction = { parts: [{ text: systemMessage.content }] };
  }

  const envModel = process.env.GEMINI_MODEL?.trim();
  const tryModels = envModel
    ? [envModel, ...GEMINI_MODEL_FALLBACKS.filter((m) => m !== envModel)]
    : [...GEMINI_MODEL_FALLBACKS];

  let lastError = "";
  for (let i = 0; i < tryModels.length; i++) {
    const model = tryModels[i];
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const errText = await res.text();

    if (res.status === 404 && i < tryModels.length - 1) {
      console.warn(`[AI assist-client] Gemini model not found, retry: ${model} → next`);
      lastError = errText;
      continue;
    }
    if (!res.ok) {
      console.error("[AI assist-client] Gemini error", res.status, errText);
      throw new Error(parseGeminiApiError(res.status, errText));
    }

    const data = JSON.parse(errText) as {
      candidates?: {
        finishReason?: string;
        content?: { parts?: { text?: string }[] };
      }[];
      promptFeedback?: { blockReason?: string };
    };
    const cand = data.candidates?.[0];
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini 요청 차단: ${data.promptFeedback.blockReason}`);
    }
    if (cand?.finishReason && cand.finishReason !== "STOP" && cand.finishReason !== "MAX_TOKENS") {
      throw new Error(`Gemini 응답 중단 (${cand.finishReason}). 내용을 바꿔 다시 시도해 주세요.`);
    }
    const text = cand?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!text) throw new Error("Gemini가 내용을 생성하지 못했습니다.");
    return text;
  }

  throw new Error(parseGeminiApiError(404, lastError || "{}"));
}

function parseAnthropicApiError(status: number, errText: string): string {
  try {
    const j = JSON.parse(errText) as { error?: { message?: string; type?: string } };
    const msg = j?.error?.message;
    if (msg) return `Claude API 오류 (${status}): ${msg}`;
  } catch {
    /* ignore */
  }
  const short = errText.length > 200 ? errText.slice(0, 200) + "…" : errText;
  return `Claude API 오류 (${status})${short ? `: ${short}` : ""}`;
}

/**
 * Anthropic Messages API (Claude)
 * @see https://docs.anthropic.com/en/api/messages
 */
export async function callAnthropic(apiKey: string, messages: ChatMessage[]): Promise<string> {
  const systemMessage = messages.find((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const anthropicMessages = rest.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const model = process.env.CLAUDE_MODEL?.trim() || CLAUDE_DEFAULT_MODEL;
  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    temperature: 0.3,
    messages: anthropicMessages,
  };
  if (systemMessage?.content) {
    body.system = systemMessage.content;
  }

  const res = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const errText = await res.text();
  if (!res.ok) {
    console.error("[AI assist-client] Anthropic error", res.status, errText);
    throw new Error(parseAnthropicApiError(res.status, errText));
  }

  const data = JSON.parse(errText) as {
    content?: { type?: string; text?: string }[];
    stop_reason?: string;
  };
  const parts =
    data.content
      ?.filter((c): c is { type: "text"; text: string } => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text) ?? [];
  const text = parts.join("\n\n").trim();
  if (!text) throw new Error("Claude가 내용을 생성하지 못했습니다.");
  return text;
}

export async function callOpenAI(apiKey: string, messages: ChatMessage[]): Promise<string> {
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
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[AI assist-client] OpenAI error", res.status, errText);
    throw new Error("OpenAI API 오류");
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("AI가 내용을 생성하지 못했습니다.");
  return content;
}

export async function callNotebookLLM(baseUrl: string, messages: ChatMessage[]): Promise<string> {
  const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
  const model = process.env.NOTEBOOK_LLM_MODEL?.trim() || NOTEBOOK_LLM_DEFAULT_MODEL;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[AI assist-client] Notebook LLM error", res.status, errText);
    throw new Error("노트북 LLM 연결 오류");
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("노트북 LLM이 내용을 생성하지 못했습니다.");
  return content;
}

export async function callAiByProvider(
  provider: AIProvider,
  messages: ChatMessage[]
): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const claudeKey = getClaudeApiKey();
  const notebookUrl = process.env.NOTEBOOK_LLM_URL?.trim();
  if (provider === "gemini") {
    if (!geminiKey) throw new Error("GEMINI_API_KEY가 없습니다.");
    return callGemini(geminiKey, messages);
  }
  if (provider === "openai") {
    if (!openAiKey) throw new Error("OPENAI_API_KEY가 없습니다.");
    return callOpenAI(openAiKey, messages);
  }
  if (provider === "claude") {
    if (!claudeKey) {
      throw new Error("CLAUDE_API_KEY(또는 ANTHROPIC_API_KEY)가 없습니다.");
    }
    return callAnthropic(claudeKey, messages);
  }
  if (!notebookUrl) throw new Error("NOTEBOOK_LLM_URL이 없습니다.");
  return callNotebookLLM(notebookUrl, messages);
}
