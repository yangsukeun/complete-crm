function envTrim(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

export type AiHubConfig = {
  claudeKey: string | undefined;
  openaiKey: string | undefined;
  geminiKey: string | undefined;
  claudeModel: string;
  openaiModel: string;
  geminiModel: string;
  isExecutive: boolean;
};

/**
 * AI 허브 전용 키·모델 — EXECUTIVE_* / STAFF_* 미설정 시 기존 공용 키로 폴백
 */
export function getAiHubConfig(role: string | undefined): AiHubConfig {
  const r = role ?? "";
  const isExecutive =
    r === "EXECUTIVE" ||
    r === "ADMIN" ||
    r === "executive" ||
    r === "admin";

  if (isExecutive) {
    return {
      claudeKey:
        envTrim("EXECUTIVE_ANTHROPIC_API_KEY") ??
        envTrim("CLAUDE_API_KEY") ??
        envTrim("ANTHROPIC_API_KEY"),
      openaiKey: envTrim("EXECUTIVE_OPENAI_API_KEY") ?? envTrim("OPENAI_API_KEY"),
      geminiKey: envTrim("EXECUTIVE_GEMINI_API_KEY") ?? envTrim("GEMINI_API_KEY"),
      claudeModel: "claude-sonnet-4-5",
      openaiModel: "gpt-4o",
      geminiModel: "gemini-1.5-pro",
      isExecutive: true,
    };
  }

  return {
    claudeKey: undefined,
    openaiKey: envTrim("STAFF_OPENAI_API_KEY") ?? envTrim("OPENAI_API_KEY"),
    geminiKey: envTrim("STAFF_GEMINI_API_KEY") ?? envTrim("GEMINI_API_KEY"),
    claudeModel: "",
    openaiModel: "gpt-4o-mini",
    geminiModel: "gemini-2.0-flash",
    isExecutive: false,
  };
}
