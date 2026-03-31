// @ts-nocheck — to-ico에 타입 정의 없음
/**
 * PWA/파비콘 PNG 생성
 * - public/logo-original.png 또는 public/KakaoTalk_20260330_133238166.png 가 있으면 사용
 * - 없으면 theme 색(#8B5CF6) 원형 + "C" 기본 마크
 *
 * 실행: npx tsx scripts/generate-icons.ts
 */
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import toIco from "to-ico";

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const ICON_DIR = path.join(PUBLIC, "icons");

const INPUT_CANDIDATES = [
  path.join(PUBLIC, "logo-original.png"),
  path.join(PUBLIC, "KakaoTalk_20260330_133238166.png"),
];

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512] as const;

function defaultMarkPng(): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="256" fill="#8B5CF6"/>
  <text x="256" y="330" font-size="200" fill="white" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700">C</text>
</svg>`;
  return Buffer.from(svg);
}

async function loadSourceBuffer(): Promise<Buffer> {
  for (const p of INPUT_CANDIDATES) {
    if (fs.existsSync(p)) {
      console.log("[icons] source:", path.basename(p));
      return sharp(p).ensureAlpha().png().toBuffer();
    }
  }
  console.log("[icons] no logo file → default purple circle");
  return sharp(defaultMarkPng()).png().toBuffer();
}

async function main() {
  const source = await loadSourceBuffer();
  fs.mkdirSync(ICON_DIR, { recursive: true });

  for (const size of SIZES) {
    const out = path.join(ICON_DIR, `icon-${size}x${size}.png`);
    await sharp(source)
      .resize(size, size, { fit: "cover", position: "centre" })
      .png()
      .toFile(out);
    console.log("✓", path.relative(ROOT, out));
  }

  await sharp(source)
    .resize(180, 180, { fit: "cover", position: "centre" })
    .png()
    .toFile(path.join(PUBLIC, "apple-touch-icon.png"));
  console.log("✓ public/apple-touch-icon.png");

  const fav16 = await sharp(source).resize(16, 16, { fit: "cover", position: "centre" }).png().toBuffer();
  const fav32 = await sharp(source).resize(32, 32, { fit: "cover", position: "centre" }).png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC, "favicon-16x16.png"), fav16);
  fs.writeFileSync(path.join(PUBLIC, "favicon-32x32.png"), fav32);
  console.log("✓ public/favicon-16x16.png");
  console.log("✓ public/favicon-32x32.png");

  const icoBuf = await toIco([fav16, fav32]);
  fs.writeFileSync(path.join(PUBLIC, "favicon.ico"), icoBuf);
  console.log("✓ public/favicon.ico");

  console.log("완료");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
