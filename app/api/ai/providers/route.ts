import { NextResponse } from "next/server";
import { auth } from "@/auth";

/** 로그인 사용자에게 사용 가능한 AI 프로바이더 목록 반환 (키/URL 노출 없음) */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const gemini = !!process.env.GEMINI_API_KEY?.trim();
    const openai = !!process.env.OPENAI_API_KEY?.trim();
    const notebook = !!process.env.NOTEBOOK_LLM_URL?.trim();
    return NextResponse.json({
      gemini,
      openai,
      notebook,
    });
  } catch (e) {
    console.error("[AI providers]", e);
    return NextResponse.json({ error: "조회에 실패했습니다." }, { status: 500 });
  }
}
