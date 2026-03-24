import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { deleteFile } from "@/lib/storage/google-drive-storage";

export const runtime = "nodejs";

/**
 * 업로드된 구글 드라이브 파일을 ID로 삭제 시도 (게시 저장 전 첨부 제거 등).
 * Drive 삭제 실패해도 200 — 클라이언트는 로컬 목록만 정리하면 됨.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await deleteFile(decodeURIComponent(id));

  return NextResponse.json({ ok: true });
}
