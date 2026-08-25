import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * @deprecated 탐색기 업로드는 /api/drive/upload-session → upload-chunk → upload-complete 사용.
 * multipart 서버 경유는 Vercel body 한도(~4.5MB)로 대용량 불가.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "이 업로드 API는 더 이상 사용하지 않습니다. 탐색기에서 새로고침 후 다시 업로드하세요.",
      code: "UPLOAD_PATH_DEPRECATED",
    },
    { status: 410 }
  );
}
