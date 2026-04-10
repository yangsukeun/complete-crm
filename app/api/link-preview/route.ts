import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { getYoutubeVideoId } from "@/lib/blocknote-youtube";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const FETCH_TIMEOUT_MS = 3000;

function emptyPreviewJson(url: string) {
  return {
    url,
    title: "",
    description: "",
    image: "",
    siteName: "",
  };
}

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

async function readFreshCache(url: string) {
  try {
    const row = await prisma.linkPreviewCache.findUnique({ where: { url } });
    if (!row) return null;
    if (Date.now() - row.updatedAt.getTime() >= CACHE_TTL_MS) return null;
    return row;
  } catch {
    return null;
  }
}

async function writeCache(
  url: string,
  data: {
    title?: string | null;
    description?: string | null;
    image?: string | null;
    siteName?: string | null;
  }
) {
  try {
    await prisma.linkPreviewCache.upsert({
      where: { url },
      create: {
        url,
        title: data.title ?? null,
        description: data.description ?? null,
        image: data.image ?? null,
        siteName: data.siteName ?? null,
      },
      update: {
        title: data.title ?? null,
        description: data.description ?? null,
        image: data.image ?? null,
        siteName: data.siteName ?? null,
      },
    });
  } catch (e) {
    console.error("[link-preview] cache upsert:", e);
  }
}

export async function GET(req: Request) {
  const urlFromQuery = (new URL(req.url).searchParams.get("url") ?? "").trim();
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = urlFromQuery;
    if (!url) return NextResponse.json({ error: "url 필요" }, { status: 400 });
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "http(s) URL만 지원" }, { status: 400 });
    }

    const cached = await readFreshCache(url);
    if (cached) {
      return NextResponse.json({
        url,
        title: cached.title ?? "",
        description: cached.description ?? "",
        image: cached.image ?? "",
        siteName: cached.siteName ?? "",
      });
    }

    const ytId = getYoutubeVideoId(url);
    if (ytId) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const watchUrl = url.includes("youtu.be") || url.includes("youtube.com")
          ? url.split("&")[0]?.split("#")[0] ?? url
          : `https://www.youtube.com/watch?v=${ytId}`;
        const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`;
        const oe = await fetch(oembed, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (oe.ok) {
          const j = (await oe.json()) as {
            title?: string;
            author_name?: string;
            thumbnail_url?: string;
          };
          clearTimeout(timeout);
          const payload = {
            url,
            title: j.title || `YouTube (${ytId})`,
            description: j.author_name ? `채널: ${j.author_name}` : "",
            image: j.thumbnail_url || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
            siteName: "YouTube",
          };
          await writeCache(url, {
            title: payload.title.slice(0, 200),
            description: payload.description.slice(0, 500),
            image: payload.image,
            siteName: payload.siteName,
          });
          return NextResponse.json(payload);
        }
      } catch {
        /* fall through */
      } finally {
        clearTimeout(timeout);
      }
      const fallback = {
        url,
        title: `YouTube 동영상`,
        description: "",
        image: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        siteName: "YouTube",
      };
      await writeCache(url, {
        title: fallback.title.slice(0, 200),
        description: "",
        image: fallback.image,
        siteName: fallback.siteName,
      });
      return NextResponse.json(fallback);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; CompleteCRM/1.0; +https://complete-crm-liard.vercel.app)",
          accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });
    } finally {
      clearTimeout(timeout);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("text/html")) {
      await writeCache(url, { title: "", description: "", image: "", siteName: "" });
      return NextResponse.json(emptyPreviewJson(url));
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

    const payload = {
      url,
      title: title.slice(0, 200),
      description: description.slice(0, 500),
      image,
      siteName,
    };
    await writeCache(url, {
      title: payload.title,
      description: payload.description,
      image: payload.image || null,
      siteName: payload.siteName || null,
    });
    return NextResponse.json(payload);
  } catch (e) {
    console.error("GET /api/link-preview error:", e);
    try {
      if (urlFromQuery && /^https?:\/\//i.test(urlFromQuery)) {
        await writeCache(urlFromQuery, { title: "", description: "", image: "", siteName: "" });
      }
    } catch {
      /* ignore */
    }
    return NextResponse.json(emptyPreviewJson(urlFromQuery));
  }
}
