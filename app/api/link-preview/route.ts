import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";

function pickMeta(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=[\\"']${prop}[\\"'][^>]+content=[\\"']([^\\\"']+)[\\"'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m?.[1]?.trim() ?? null;
}

function pickTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const url = (searchParams.get("url") ?? "").trim();
    if (!url) return NextResponse.json({ error: "url 필요" }, { status: 400 });
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "http(s) URL만 지원" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; CompleteCRM/1.0; +https://complete-crm-liard.vercel.app)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    }).finally(() => clearTimeout(timeout));

    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      return NextResponse.json({ error: "fetch 실패" }, { status: 502 });
    }
    if (!contentType.includes("text/html")) {
      return NextResponse.json({ error: "html이 아님" }, { status: 400 });
    }

    const html = (await res.text()).slice(0, 200_000);
    const title =
      pickMeta(html, "og:title") ||
      pickMeta(html, "twitter:title") ||
      pickTitle(html) ||
      url;
    const description =
      pickMeta(html, "og:description") ||
      pickMeta(html, "twitter:description") ||
      "";
    const image =
      pickMeta(html, "og:image") || pickMeta(html, "twitter:image") || "";
    const siteName = pickMeta(html, "og:site_name") || "";

    return NextResponse.json({
      url,
      title,
      description,
      image,
      siteName,
    });
  } catch (e) {
    console.error("GET /api/link-preview error:", e);
    return NextResponse.json({ error: "미리보기를 불러올 수 없습니다." }, { status: 500 });
  }
}

