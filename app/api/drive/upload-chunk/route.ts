import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { verifyExplorerUploadSession } from "@/lib/drive/upload-session-token";

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

    const buf = Buffer.from(await req.arrayBuffer());
    const gRes = await fetch(verified.payload.gUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(buf.byteLength),
        "Content-Range": contentRange,
        "Content-Type": verified.payload.mime || "application/octet-stream",
      },
      body: buf,
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

    console.error("[upload-chunk] google error", gRes.status, text.slice(0, 400));
    return NextResponse.json(
      {
        error: "청크 업로드에 실패했습니다.",
        googleStatus: gRes.status,
        detail: text.slice(0, 200),
      },
      { status: 502 }
    );
  } catch (e) {
    console.error("[upload-chunk]", e);
    const msg = e instanceof Error ? e.message : "청크 업로드 실패";
    return NextResponse.json(
      { error: msg.length < 400 ? msg : "청크 업로드 실패" },
      { status: 500 }
    );
  }
}
