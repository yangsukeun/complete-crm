// @ts-nocheck — to-ico
/**
 * public/logo-original.png 기준으로 PWA 보조 크기·Apple Touch·OG 합성.
 * favicon-16/32 PNG가 이미 있으면 favicon.ico만 합침.
 *
 * 실행: npx tsx scripts/brand-icons-build.ts
 */
import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import toIco from "to-ico";

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const ICON_DIR = path.join(PUBLIC, "icons");

const EXTRA_SIZES = [72, 96, 128, 144, 152, 384] as const;

/** 테마 바이올렛 app/layout viewport 와 맞춤 */
const OG_BG = { r: 109, g: 40, b: 217, alpha: 1 };

async function main() {
  const sourcePath = path.join(PUBLIC, "logo-original.png");
  if (!fs.existsSync(sourcePath)) {
    console.error("[brand-icons] missing public/logo-original.png");
    process.exit(1);
  }

  const sourceBuf = await sharp(sourcePath).ensureAlpha().png().toBuffer();
  fs.mkdirSync(ICON_DIR, { recursive: true });

  for (const size of EXTRA_SIZES) {
    const out = path.join(ICON_DIR, `icon-${size}x${size}.png`);
    await sharp(sourceBuf)
      .resize(size, size, { fit: "cover", position: "centre" })
      .png()
      .toFile(out);
    console.log("✓", path.relative(ROOT, out));
  }

  await sharp(sourceBuf)
    .resize(180, 180, { fit: "cover", position: "centre" })
    .png()
    .toFile(path.join(PUBLIC, "apple-touch-icon.png"));
  console.log("✓ public/apple-touch-icon.png");

  const logoForOg = await sharp(sourceBuf)
    .resize(520, 520, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: OG_BG,
    },
  })
    .composite([{ input: logoForOg, gravity: "centre" }])
    .png()
    .toFile(path.join(PUBLIC, "og-image.png"));
  console.log("✓ public/og-image.png (1200×630)");

  const fav16Path = path.join(PUBLIC, "favicon-16x16.png");
  const fav32Path = path.join(PUBLIC, "favicon-32x32.png");
  if (fs.existsSync(fav16Path) && fs.existsSync(fav32Path)) {
    const fav16 = fs.readFileSync(fav16Path);
    const fav32 = fs.readFileSync(fav32Path);
    const icoBuf = await toIco([fav16, fav32]);
    fs.writeFileSync(path.join(PUBLIC, "favicon.ico"), icoBuf);
    console.log("✓ public/favicon.ico (from favicon-16 + favicon-32)");
  } else {
    console.warn("[brand-icons] favicon PNG missing — skip favicon.ico");
  }

  console.log("완료");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
