import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { deleteFile } from "@/lib/storage/google-drive-storage";

export const runtime = "nodejs";

/**
 * 업로드된 구글 드라이브 파일을 ID로 삭제 시도 (게시 저장 전 첨부 제거 등).
 * Drive 삭제 실패해도 200 — 클라이언트는 로컬 목록만 정리하면 됨.
 *
 * 부채: Upload/FileAsset 모델 없음 → 업로더 소유권 추적 불가.
 * 현재는 ADMIN/EXECUTIVE만 삭제 허용.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN" && role !== "EXECUTIVE") {
    return NextResponse.json(
      { error: "삭제 권한이 없습니다. (업로드 소유자 기록이 없어 관리자만 가능)" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const decoded = decodeURIComponent(id);
  console.log("[upload] DELETE /api/upload/[id] → deleteFile", {
    fileIdPrefix: decoded.slice(0, 12) + "…",
  });
  await deleteFile(decoded);

  return NextResponse.json({ ok: true });
}
