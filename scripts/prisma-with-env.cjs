/**
 * .env 로드 후 DIRECT_URL이 없으면 DATABASE_URL을 복사합니다.
 * schema.prisma의 directUrl 필수 환경 변수를 채워, pooler만 있는 기존 .env도 깨지지 않게 합니다.
 * 마이그레이션은 여전히 DIRECT_URL(직접 5432)을 쓰는 것이 좋고, 같으면 DATABASE_URL만 넣어도 동작합니다.
 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

try {
  require("dotenv").config({ path: path.join(root, ".env") });
} catch (_) {
  /* optional */
}

if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prisma-with-env.cjs <prisma args...>");
  console.error('Example: node scripts/prisma-with-env.cjs migrate deploy');
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", ...args], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status === null ? 1 : result.status);
