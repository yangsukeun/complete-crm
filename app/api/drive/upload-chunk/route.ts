import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { verifyExplorerUploadSession } from "@/lib/drive/upload-session-token";
import { EXPLORER_UPLOAD_CHUNK_BYTES } from "@/lib/drive/explorer-upload-limits";

export const runtime = "nodejs";
export const maxDuration = 300;

function extractSessionToken(req: Request): string {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token")?.trim() || "";
  if (fromQuery) return fromQuery;
  const h =
    req.headers.get("x-upload-session")?.trim() ||
    req.headers.get("X-Upload-Session")?.trim() ||
    "";
  return h;
}

/**
 * PUT /api/drive/upload-chunk
 * 클라이언트 청크 → Google resumable URL 프록시.
 * 헤더: X-Upload-Session (세션 토큰), Content-Range 필수.
 * 최종 청크(200/201) 시 Google 파일 JSON 반환.
 */
export async function PUT(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const token = extractSessionToken(req);
    if (!token) {
      return NextResponse.json({ error: "세션 토큰이 필요합니다." }, { status: 400 });
    }

    const verified = verifyExplorerUploadSession(token);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: 403 });
    }
    if (verified.payload.uid !== session.user.id) {
      return NextResponse.json({ error: "세션 소유자가 아닙니다." }, { status: 403 });
    }

    const contentRange = req.headers.get("content-range") || req.headers.get("Content-Range");
    if (!contentRange) {
      return NextResponse.json({ error: "Content-Range 헤더가 필요합니다." }, { status: 400 });
    }

    // 상태 조회: Content-Range: bytes */N + 빈 본문
    const isStatusQuery = /^\s*bytes\s+\*\/\d+\s*$/i.test(contentRange);
    const parts = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
    const total = isStatusQuery ? Number(contentRange.split('/')[1]) : Number(parts?.[3]);
    const start = Number(parts?.[1]), end = Number(parts?.[2]);
    if (total !== verified.payload.size || (!isStatusQuery && (!parts || start > end || end >= total || end - start + 1 > EXPLORER_UPLOAD_CHUNK_BYTES))) {
      return NextResponse.json({error:'업로드 범위가 파일 크기와 맞지 않습니다.',retryable:false},{status:400});
    }
    const buf = isStatusQuery ? Buffer.alloc(0) : Buffer.from(await req.arrayBuffer());
    if (!isStatusQuery && (buf.length !== end - start + 1 || (end + 1 < total && buf.length % (256 * 1024) !== 0))) return NextResponse.json({error:'청크 길이가 올바르지 않습니다.',retryable:false},{status:400});

    const gHeaders: Record<string, string> = {
      "Content-Length": String(buf.byteLength),
      "Content-Range": contentRange,
    };
    if (!isStatusQuery) {
      gHeaders["Content-Type"] = verified.payload.mime || "application/octet-stream";
    }

    const gRes = await fetch(verified.payload.gUrl, {
      method: "PUT",
      headers: gHeaders,
      body: buf.byteLength > 0 ? buf : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000),
    });

    const text = await gRes.text().catch(() => "");
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (gRes.status === 308 || gRes.status === 200 || gRes.status === 201) {
      const range = gRes.headers.get("range") || gRes.headers.get("Range");
      return NextResponse.json(
        {
          ok: true,
          status: gRes.status,
          range,
          file: gRes.status === 200 || gRes.status === 201 ? json : null,
        },
        { status: 200 }
      );
    }

    const retryable = gRes.status === 429 || gRes.status >= 500;
    const expired = gRes.status === 404 || gRes.status === 410;
    console.error("[upload-chunk] google status", gRes.status);
    return NextResponse.json(
      {
        error: expired ? 'Drive 업로드 세션이 만료되었습니다. 목록을 확인한 뒤 파일을 다시 선택하세요.' : retryable ? 'Drive에 일시적으로 연결할 수 없습니다.' : 'Drive가 업로드를 거부했습니다. 폴더 권한 또는 저장 공간을 확인하세요.',
        googleStatus: gRes.status,
        retryable,
      },
      { status: expired ? 410 : retryable ? 503 : 422 }
    );
  } catch (e) {
    console.error("[upload-chunk] transport failure", e instanceof Error ? e.name : 'UnknownError');
    return NextResponse.json(
      { error: '업로드 연결이 일시적으로 중단되었습니다.', retryable: true },
      { status: 503 }
    );
  }
}
