import { NextResponse } from "next/server";

/**
 * 비밀번호 재설정 API — 임시 비활성화.
 * 인증 없이 임의 계정 비밀번호를 변경할 수 있어 보안상 차단함.
 * 정식 재설정(토큰/이메일)은 별도 구현 전까지 제공하지 않음.
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
