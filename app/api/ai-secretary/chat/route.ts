import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { getSecretaryProviderFromEnv } from "@/lib/ai/assist-client";
import { sendSecretaryMessage } from "@/lib/ai-secretary/run-chat";

/** 서버 환경변수 미설정(callAiByProvider 직전 검사) — 넓은 includes로 API 본문 오류가 503 되는 것 방지 */
function isMissingServerAiConfigError(msg: string): boolean {
  return (
    msg.includes("GEMINI_API_KEY가 없습니다") ||
    msg.includes("OPENAI_API_KEY가 없습니다") ||
    msg.includes("CLAUDE_API_KEY(또는 ANTHROPIC_API_KEY)가 없습니다") ||
    msg.includes("NOTEBOOK_LLM_URL이 없습니다")
  );
}

/**
 * AI 비서 메시지 전송 — assist/route.ts와 동일하게 callAiByProvider 사용 (run-chat 내부)
 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const dateKey = typeof body.dateKey === "string" ? body.dateKey.trim() : "";
    const message = typeof body.message === "string" ? body.message : "";

    /** 클라이언트 body 무시 — Vercel `AI_PROVIDER` (기본 claude)만 사용 */
    const requestedProvider = getSecretaryProviderFromEnv();

    const role = session.user.role ?? "USER";

    console.log("[ai-secretary/chat] POST (Vercel Functions 로그)", {
      userId: session.user.id,
      dateKey,
      serverProvider: requestedProvider,
      AI_PROVIDER_env: process.env.AI_PROVIDER ?? "(unset → default claude)",
      messageLen: typeof message === "string" ? message.length : 0,
    });

    const { reply } = await sendSecretaryMessage({
      userId: session.user.id,
      role,
      dateKey,
      message,
      requestedProvider,
    });

    return NextResponse.json({ text: reply });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "오류";
    if (msg.includes("비어") || msg.includes("형식")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (isMissingServerAiConfigError(msg)) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    console.error("[ai-secretary/chat]", e);
    return NextResponse.json({ error: `AI 처리 중 오류: ${msg}` }, { status: 502 });
  }
}
