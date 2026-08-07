import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { NasApiError, listNasFiles } from "@/lib/nas/filestation";

export const runtime = "nodejs";

/**
 * GET /api/nas/files?path=/문서공유/...
 * File Station 목록 메타데이터만 (파일 바이트 미수신).
 * 권한: 로그인한 전 직원.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const path = req.nextUrl.searchParams.get("path");
    const result = await listNasFiles(path);

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NasApiError) {
      const status =
        e.code === "NOT_CONFIGURED"
          ? 503
          : e.code === "AUTH_FAILED"
            ? 502
            : e.code === "FORBIDDEN_PATH"
              ? 403
              : e.code === "NETWORK" || e.code === "QUICKCONNECT"
                ? 502
                : 502;
      console.error("[nas/files]", e.code, e.message, e.synoCode ?? "");
      return NextResponse.json(
        {
          error: e.message,
          code: e.code,
        },
        { status }
      );
    }
    console.error("[nas/files]", e);
    return NextResponse.json({ error: "NAS 문서함 조회에 실패했습니다." }, { status: 500 });
  }
}
