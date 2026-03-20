import { NextResponse } from "next/server";

/** 비활성화: 배포와 동일하게 정식 로그인만 사용합니다. */
export async function POST() {
  return NextResponse.json({ error: "Not available." }, { status: 403 });
}
