import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getCompanyLogoUrl } from "@/lib/header-bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PWA·홈 화면용 — 브라우저가 .ico·원본 비율을 거부해 이니셜만 나오는 것을 막기 위해 항상 PNG로 리사이즈 */
function parseSize(raw: string | null): number {
  const n = parseInt(raw || "192", 10);
  if (n >= 400) return 512;
  if (n === 180) return 180;
  if (n === 144) return 144;
  return 192;
}

async function loadSourceBuffer(): Promise<Buffer> {
  const logo = (await getCompanyLogoUrl())?.trim();
  if (logo) {
    try {
      const upstream = await fetch(logo, { cache: "no-store" });
      if (upstream.ok) return Buffer.from(await upstream.arrayBuffer());
    } catch (e) {
      console.error("[branding/pwa-icon] logo fetch failed:", e);
    }
  }
  const fallback = path.join(process.cwd(), "public", "icons", "icon-512x512.png");
  return readFile(fallback);
}

async function renderPng(input: Buffer, size: number, maskable: boolean): Promise<Buffer> {
  if (maskable && size >= 512) {
    const inner = Math.round(size * 0.76);
    const innerBuf = await sharp(input)
      .resize(inner, inner, { fit: "inside" })
      .png()
      .toBuffer();
    return sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([{ input: innerBuf, gravity: "center" }])
      .png()
      .toBuffer();
  }
  return sharp(input)
    .resize(size, size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
}

export async function GET(req: NextRequest) {
  const size = parseSize(req.nextUrl.searchParams.get("size"));
  const maskable = req.nextUrl.searchParams.get("mask") === "1";

  try {
    let input = await loadSourceBuffer();
    let out: Buffer;
    try {
      out = await renderPng(input, size, maskable);
    } catch {
      const fallbackPath = path.join(process.cwd(), "public", "icons", "icon-512x512.png");
      input = await readFile(fallbackPath);
      out = await renderPng(input, size, maskable);
    }

    return new NextResponse(new Uint8Array(out), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    console.error("[branding/pwa-icon] failed:", e);
    return new NextResponse(null, { status: 500 });
  }
}
