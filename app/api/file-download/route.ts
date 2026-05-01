import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { getDriveDownloadUrl } from "@/lib/google-drive-url";
import { secureDownloadHeaders } from "@/lib/download-response-headers";
import { getWebdavBufferByPublicUrl } from "@/lib/storage/webdav-storage";

export const runtime = "nodejs";

/** 서버 Node Buffer ↔ fetch BodyInit 타입 불일치 완화 */
function asResponseBody(buf: Buffer): BodyInit {
  return buf as unknown as BodyInit;
}

function sanitizeDownloadName(name: string): string {
  const n = name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
  return n.length > 0 ? n : "download";
}

/** 허용된 첨부 URL만 다운로드 프록시 (임의 SSRF 방지) */
function isAllowedSourceUrl(urlStr: string): boolean {
  if (urlStr.startsWith("/uploads/content/")) return true;
  const webdavBase = process.env.WEBDAV_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (webdavBase && urlStr.startsWith(webdavBase)) return true;
  if (/\.public\.blob\.vercel-storage\.com/i.test(urlStr)) return true;
  return false;
}

export async function GET(req: Request) {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let rawUrl = (searchParams.get("url") ?? "").trim();
  const nameRaw = (searchParams.get("name") ?? "download").trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "url 필요" }, { status: 400 });
  }

  try {
    rawUrl = decodeURIComponent(rawUrl);
  } catch {
    /* 원본 유지 */
  }

  const fileName = sanitizeDownloadName(nameRaw || "download");

  if (/drive\.google\.com/i.test(rawUrl)) {
    /** Google이 직접 응답 — Content-Disposition 제어 불가. 필요 시 Drive 프록시 도입 검토. */
    return NextResponse.redirect(getDriveDownloadUrl(rawUrl));
  }

  if (!isAllowedSourceUrl(rawUrl)) {
    return NextResponse.json({ error: "이 URL은 다운로드 프록시를 지원하지 않습니다." }, { status: 400 });
  }

  if (rawUrl.startsWith("/uploads/content/")) {
    if (process.env.VERCEL) {
      return NextResponse.json({ error: "Vercel에서는 로컬 업로드 경로를 제공할 수 없습니다." }, { status: 400 });
    }
    const base = path.basename(rawUrl.replace(/^\/uploads\/content\//, ""));
    if (!base || base.includes("..")) {
      return NextResponse.json({ error: "잘못된 경로입니다." }, { status: 400 });
    }
    const fp = path.join(process.cwd(), "public", "uploads", "content", base);
    if (!fs.existsSync(fp)) {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }
    const buf = fs.readFileSync(fp);
    const h = secureDownloadHeaders(fileName, "application/octet-stream");
    return new NextResponse(asResponseBody(buf), {
      headers: {
        ...h,
        "Content-Length": String(buf.length),
      },
    });
  }

  const webdavBuf = await getWebdavBufferByPublicUrl(rawUrl);
  if (webdavBuf) {
    const h = secureDownloadHeaders(fileName, null);
    return new NextResponse(asResponseBody(webdavBuf), {
      headers: {
        ...h,
        "Content-Length": String(webdavBuf.length),
      },
    });
  }

  if (/\.public\.blob\.vercel-storage\.com/i.test(rawUrl)) {
    const res = await fetch(rawUrl.split("#")[0] ?? rawUrl);
    if (!res.ok) {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type");
    const h = secureDownloadHeaders(fileName, ct);
    return new NextResponse(asResponseBody(buf), {
      headers: {
        ...h,
        "Content-Length": String(buf.length),
      },
    });
  }

  return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
}
