import { NextResponse } from "next/server";

/**
 * /api/s/group 요청 처리 (외부/캐시 등에서 호출 시 404 방지).
 * 그룹 목록 API가 필요하면 여기서 세션 확인 후 채팅 그룹 등 반환 가능.
 */
export async function GET() {
  return NextResponse.json([]);
}

export async function POST() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
