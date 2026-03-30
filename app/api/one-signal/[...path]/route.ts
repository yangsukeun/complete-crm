import { NextResponse } from "next/server";

/**
 * 일부 OneSignal/프록시 설정이 존재하지 않는 `/api/one-signal/...`로 요청을 보낼 때
 * Vercel 404 노이즈를 줄이기 위한 무해한 응답입니다.
 * 실제 푸시 등록은 `/api/user/onesignal-register` 등을 사용합니다.
 */
export async function GET() {
  return NextResponse.json({ ok: true, message: "noop" }, { status: 200 });
}

export async function POST() {
  return NextResponse.json({ ok: true, message: "noop" }, { status: 200 });
}
