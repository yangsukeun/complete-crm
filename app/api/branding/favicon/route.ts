import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getCompanyLogoUrl } from "@/lib/header-bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 동일 출처 파비콘 — DB 회사 로고가 있으면 그 바이트를 내려주고, 없으면 public/favicon.ico.
 * (외부 URL을 link에만 넣으면 브라우저/캐시·리다이렉트 이슈로 탭 아이콘이 안 바뀌는 경우가 많음)
 */
export async function GET() {
  const logo = (await getCompanyLogoUrl())?.trim();
  if (logo) {
    try {
      const upstream = await fetch(logo, { cache: "no-store" });
      if (upstream.ok) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        const ct =
          upstream.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/png";
        return new NextResponse(buf, {
          status: 200,
          headers: {
            "Content-Type": ct,
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400", // [PERF-claude-code] 로고 파비콘 1시간 캐시
          },
        });
      }
    } catch (e) {
      console.error("[branding/favicon] upstream fetch failed:", e);
    }
  }

  try {
    const filePath = path.join(process.cwd(), "public", "favicon.ico");
    const buf = await readFile(filePath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/x-icon",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
