import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAppSession } from "@/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { content?: unknown } | null;
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "내용이 없습니다" }, { status: 400 });
  }

  const apiKey = process.env.CLAUDE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "CLAUDE_API_KEY 가 설정되지 않았습니다" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `다음 미팅 내용을 체계적인 회의록으로 정리해주세요.

${content}

아래 마크다운 형식으로 정리:

## 회의 정보
- 일시: (내용에서 추출, 없으면 오늘 날짜)
- 참석자: (내용에서 추출)

## 주요 안건

## 논의 내용

## 결정 사항

## 액션 아이템
- [ ] 담당자: , 기한:

한국어로 작성해주세요.`,
      },
    ],
  });

  const first = response.content?.[0];
  const summary = first && first.type === "text" ? first.text : "";

  return NextResponse.json({ summary });
}

