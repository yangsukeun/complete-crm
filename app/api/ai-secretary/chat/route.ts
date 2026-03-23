import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import type { AIProvider } from "@/lib/ai/assist-client";
import { sendSecretaryMessage } from "@/lib/ai-secretary/run-chat";

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
    const bodyProvider = body.provider;
    const requestedProvider: AIProvider | null =
      bodyProvider === "gemini" ||
      bodyProvider === "openai" ||
      bodyProvider === "notebook" ||
      bodyProvider === "claude"
        ? bodyProvider
        : null;

    const role = session.user.role ?? "USER";

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
    if (msg.includes("API_KEY") || msg.includes("NOTEBOOK_LLM")) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    console.error("[ai-secretary/chat]", e);
    return NextResponse.json({ error: `AI 처리 중 오류: ${msg}` }, { status: 502 });
  }
}
