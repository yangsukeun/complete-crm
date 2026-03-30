import { NextResponse } from "next/server";

/**
 * 구/외부 클라이언트가 `GET /api/chat/message?roomId=…` 형태로 호출하는 경우 호환.
 * 실제 구현은 `/api/chats/[id]/messages` 입니다.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const roomId = u.searchParams.get("roomId")?.trim();
  if (!roomId) {
    return NextResponse.json({ error: "roomId 쿼리가 필요합니다." }, { status: 400 });
  }
  u.searchParams.delete("roomId");
  const qs = u.searchParams.toString();
  const path = `/api/chats/${encodeURIComponent(roomId)}/messages${qs ? `?${qs}` : ""}`;
  return NextResponse.redirect(new URL(path, u.origin), 307);
}
