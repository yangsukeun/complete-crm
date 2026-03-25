/** assist/route.ts · delegate-task에서 공통 사용 — AI_PROVIDER·키 동일 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** Google이 모델 ID를 바꾸는 경우가 있어, 404 시 아래 순으로 한 번씩 재시도 */
export const GEMINI_MODEL_FALLBACKS = ["gemini-1.5-flash", "gemini-2.5-flash-lite"] as const;
export const GEMINI_DEFAULT_MODEL = "gemini-1.5-flash";
/** `CLAUDE_MODEL` 미설정 시 기본 (Anthropic 콘솔 모델 ID) */
export const CLAUDE_DEFAULT_MODEL = "claude-sonnet-4-6";
const NOTEBOOK_LLM_DEFAULT_MODEL = "llama3.2";

export type AIProvider = "gemini" | "openai" | "notebook" | "claude";

/** `.env` 기준 권장: `CLAUDE_API_KEY`. 호환용으로 `ANTHROPIC_API_KEY`도 허용 */
/** 서버에서만 사용. 우선 `CLAUDE_API_KEY`, 없으면 `ANTHROPIC_API_KEY` */
export function getClaudeApiKey(): string {
  return (process.env.CLAUDE_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "").trim();
}

/** Vercel Functions 로그용 — 전체 키는 절대 출력하지 않음 */
export function maskApiKeyForLog(key: string): string {
  const k = key.trim();
  if (!k) return "(empty)";
  if (k.length <= 12) return "***";
  return `${k.slice(0, 8)}…${k.slice(-4)} (len=${k.length})`;
}

/**
 * CLAUDE_API_KEY 등이 런타임에 로드되는지 확인 (Vercel 대시보드 → Functions 로그)
 */
export function logClaudeEnvForVercel(context: string): void {
  const fromClaude = (process.env.CLAUDE_API_KEY ?? "").trim();
  const fromAnthropic = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  const effective = getClaudeApiKey();
  console.log(`[AI assist-client][Claude][env] ${context}`, {
    AI_PROVIDER: process.env.AI_PROVIDER ?? "(unset)",
    CLAUDE_MODEL: process.env.CLAUDE_MODEL ?? "(unset, using default)",
    CLAUDE_MAX_TOKENS: process.env.CLAUDE_MAX_TOKENS ?? "(unset → 1000)",
    NODE_ENV: process.env.NODE_ENV,
    env_CLAUDE_API_KEY_set: fromClaude.length > 0,
    env_ANTHROPIC_API_KEY_set: fromAnthropic.length > 0,
    effective_key_present: effective.length > 0,
    effective_key_masked: maskApiKeyForLog(effective),
  });
}

/** 요청 프로바이더에 해당 API 키가 없으면, 서버 기본값·Claude 등 사용 가능한 쪽으로 폴백 */
export function resolveProviderWithAvailableKeys(
  wanted: AIProvider,
  keys: { gemini: boolean; openai: boolean; claude: boolean; notebook: boolean }
): AIProvider {
  const ok = (p: AIProvider) =>
    (p === "gemini" && keys.gemini) ||
    (p === "openai" && keys.openai) ||
    (p === "claude" && keys.claude) ||
    (p === "notebook" && keys.notebook);

  if (ok(wanted)) return wanted;

  const serverDefault = getProvider();
  const tryOrder: AIProvider[] = [serverDefault, "claude", "gemini", "openai", "notebook"];
  const seen = new Set<string>();
  for (const p of tryOrder) {
    if (seen.has(p)) continue;
    seen.add(p);
    if (ok(p)) return p;
  }
  return wanted;
}

export function getProvider(): AIProvider {
  const raw = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();
  if (raw === "openai" || raw === "gpt") return "openai";
  if (raw === "notebook" || raw === "local" || raw === "ollama") return "notebook";
  if (raw === "claude" || raw === "anthropic") return "claude";
  return "gemini";
}

/**
 * AI 비서 `/api/ai-secretary/chat` 전용: body가 아닌 서버 `AI_PROVIDER`만 사용.
 * 미설정 시 기본 `claude` (일반 `getProvider()`는 기본이 gemini라 분리)
 */
export function getSecretaryProviderFromEnv(): AIProvider {
  const raw = (process.env.AI_PROVIDER ?? "claude").trim().toLowerCase();
  if (raw === "openai" || raw === "gpt") return "openai";
  if (raw === "notebook" || raw === "local" || raw === "ollama") return "notebook";
  if (raw === "claude" || raw === "anthropic") return "claude";
  if (raw === "gemini") return "gemini";
  return "claude";
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Anthropic Messages API `max_tokens` — `CLAUDE_MAX_TOKENS` 미설정 시 1000 */
function getClaudeMaxTokensFromEnv(): number {
  const n = Number(process.env.CLAUDE_MAX_TOKENS) || 1000;
  return Math.max(1, Math.floor(n));
}

/**
 * Gemini 일시 장애(429·5xx)·네트워크 오류 시 Claude로 재시도할지 판별.
 * 인증/요청 오류(4xx)·안전 필터·모델 없음 등은 폴백하지 않음.
 */
export function shouldFallbackGeminiToClaude(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /Gemini 요청 차단|Gemini 응답 중단|Gemini 모델을 찾을 수 없습니다|Gemini가 내용을 생성하지 못했습니다/.test(
      msg
    )
  ) {
    return false;
  }
  const m = /Gemini API 오류 \((\d+)\)/.exec(msg);
  if (m) {
    const code = Number(m[1]);
    if (code === 429) return true;
    if (code >= 500 && code < 600) return true;
    return false;
  }
  if (/Failed to fetch|NetworkError|ECONNRESET|ETIMEDOUT|fetch failed|ENOTFOUND|socket hang up/i.test(msg)) {
    return true;
  }
  return false;
}

/**
 * Gemini가 HTTP 200으로 끝났지만 본문이 비었거나 실패 안내만 준 경우 → Claude로 재시도.
 */
export function shouldRetryGeminiSecretaryWithClaude(reply: string): boolean {
  const t = (reply ?? "").trim();
  if (!t) return true;
  if (
    t === "응답을 생성하지 못했습니다." ||
    t === "응답을 생성하지 못했습니다" ||
    t.includes("응답을 생성하지 못했습니다")
  ) {
    return true;
  }
  if (t === "요청을 처리하지 못했습니다." || t === "요청을 처리하지 못했습니다" || t.includes("요청을 처리하지 못했습니다")) {
    return true;
  }
  return false;
}

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
  logClaudeEnvForVercel("callAnthropic:entry");

  const systemMessage = messages.find((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const anthropicMessages = rest.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const model = process.env.CLAUDE_MODEL?.trim() || CLAUDE_DEFAULT_MODEL;
  const systemPrompt = systemMessage?.content ?? "";
  const maxTokens = getClaudeMaxTokensFromEnv();
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature: 0.3,
    messages: anthropicMessages,
  };
  if (systemPrompt) {
    body.system = systemPrompt;
  }

  /** `CLAUDE_API_KEY` 우선, 없으면 `getClaudeApiKey()`로 넘어온 키(ANTHROPIC_API_KEY 등) */
  const headerKey = (process.env.CLAUDE_API_KEY ?? "").trim() || apiKey;

  try {
    console.log("[AI assist-client][Claude] stage: prepare", {
      url: ANTHROPIC_MESSAGES_URL,
      model,
      max_tokens: maxTokens,
      messagesCount: anthropicMessages.length,
      systemChars: systemPrompt.length,
      headerKey_source: (process.env.CLAUDE_API_KEY ?? "").trim() ? "CLAUDE_API_KEY" : "param_apiKey",
      headerKey_masked: maskApiKeyForLog(headerKey),
    });

    let res: Response;
    try {
      console.log("[AI assist-client][Claude] stage: fetch_start");
      /* Anthropic Messages API — callAiByProvider(claude) → 여기서 POST */
      res = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": headerKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
      console.log("[AI assist-client][Claude] stage: fetch_done", { ok: res.ok, status: res.status });
    } catch (fetchErr) {
      console.error("[AI assist-client][Claude] stage: fetch_threw", {
        name: fetchErr instanceof Error ? fetchErr.name : typeof fetchErr,
        message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        stack: fetchErr instanceof Error ? fetchErr.stack : undefined,
      });
      throw fetchErr;
    }

    const errText = await res.text();

    if (!res.ok) {
      console.error("[AI assist-client][Claude] stage: http_error", {
        status: res.status,
        statusText: res.statusText,
        bodyPreview: errText.length > 800 ? `${errText.slice(0, 800)}…` : errText,
      });
      throw new Error(parseAnthropicApiError(res.status, errText));
    }

    let data: {
      content?: { type?: string; text?: string }[];
      stop_reason?: string;
    };
    try {
      data = JSON.parse(errText) as {
        content?: { type?: string; text?: string }[];
        stop_reason?: string;
      };
    } catch (parseErr) {
      console.error("[AI assist-client][Claude] stage: json_parse_failed", {
        err: parseErr instanceof Error ? parseErr.message : String(parseErr),
        rawPreview: errText.length > 400 ? `${errText.slice(0, 400)}…` : errText,
      });
      throw new Error("Claude API 응답 JSON 파싱 실패");
    }

    const parts =
      data.content
        ?.filter((c): c is { type: "text"; text: string } => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text) ?? [];
    const text = parts.join("\n\n").trim();
    if (!text) {
      console.error("[AI assist-client][Claude] stage: empty_text", {
        stop_reason: data.stop_reason,
        contentBlocks: data.content?.length ?? 0,
      });
      throw new Error("Claude가 내용을 생성하지 못했습니다.");
    }

    console.log("[AI assist-client][Claude] stage: success", {
      replyChars: text.length,
      stop_reason: data.stop_reason,
    });
    return text;
  } catch (e) {
    console.error("[AI assist-client][Claude] callAnthropic failed (caught)", {
      isError: e instanceof Error,
      name: e instanceof Error ? e.name : undefined,
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    throw e;
  }
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
    try {
      return await callGemini(geminiKey, messages);
    } catch (e) {
      if (!shouldFallbackGeminiToClaude(e)) throw e;
      if (!claudeKey) {
        console.warn("[AI assist-client] Gemini failed; no Claude key for fallback");
        throw e;
      }
      console.warn("[AI assist-client] Gemini failed; falling back to Claude (로그만, 사용자에게는 모델명 미노출)");
      try {
        return await callAnthropic(claudeKey, messages);
      } catch (e2) {
        console.error("[AI assist-client] Claude fallback failed", e2);
        throw new Error(
          "지금은 AI 응답을 생성할 수 없습니다. 잠시 후 다시 시도해 주세요."
        );
      }
    }
  }
  if (provider === "openai") {
    if (!openAiKey) throw new Error("OPENAI_API_KEY가 없습니다.");
    return callOpenAI(openAiKey, messages);
  }
  if (provider === "claude") {
    if (!claudeKey) {
      logClaudeEnvForVercel("callAiByProvider:claude_missing_key");
      throw new Error("CLAUDE_API_KEY(또는 ANTHROPIC_API_KEY)가 없습니다.");
    }
    console.log("[AI assist-client] callAiByProvider → Claude", {
      provider,
      key_masked: maskApiKeyForLog(claudeKey),
    });
    return callAnthropic(claudeKey, messages);
  }
  if (!notebookUrl) throw new Error("NOTEBOOK_LLM_URL이 없습니다.");
  return callNotebookLLM(notebookUrl, messages);
}
