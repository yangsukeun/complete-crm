import { NextResponse } from "next/server";

/**
 * 레거시 초기 설정용 API — 운영에서는 비활성.
 * 직원·관리자 계정은 /admin/employees 또는 seed 로만 생성합니다.
 */
export async function POST() {
  return NextResponse.json(
    { error: "공개 회원가입이 비활성화되어 있습니다. 관리자에게 계정 생성을 요청하세요." },
    { status: 403 }
  );
}
