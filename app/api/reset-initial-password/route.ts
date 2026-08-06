import { NextResponse } from "next/server";

/**
 * 초기 비밀번호 재설정 API — 비활성화.
 * 이메일만으로(또는 공유 시크릿만으로) 임의 계정 비밀번호를 바꿀 수 있어
 * 보안상 차단합니다. 정식 재설정은 별도 구현 전까지 제공하지 않습니다.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "비밀번호 재설정 기능이 일시적으로 비활성화되었습니다. 관리자에게 문의하세요.",
      code: "RESET_PASSWORD_DISABLED",
    },
    { status: 410 }
  );
}
