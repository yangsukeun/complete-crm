/**
 * 이미 데이터가 있는 Supabase DB에 Prisma 마이그레이션 기록만 맞출 때 사용합니다.
 *
 * 순서:
 * 1) npm run db:push  (또는 SQL로 스키마가 schema.prisma 와 동일해진 뒤)
 * 2) npm run db:baseline
 * 3) npm run db:migrate → "No pending migrations" 확인
 *
 * db push 없이 baseline만 하면, DB에 아직 없는 변경은 반영되지 않습니다.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const migrationsDir = path.join(root, "prisma", "migrations");

try {
  require("dotenv").config({ path: path.join(root, ".env") });
} catch (_) {
  /* optional */
}
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const dirs = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(migrationsDir, d.name, "migration.sql")))
  .map((d) => d.name)
  .sort();

if (dirs.length === 0) {
  console.error("No migrations found under prisma/migrations");
  process.exit(1);
}

console.log(`Baselining ${dirs.length} migration(s) as already applied...\n`);

for (const name of dirs) {
  console.log(`  → resolve --applied "${name}"`);
  const r = spawnSync("npx", ["prisma", "migrate", "resolve", "--applied", name], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
  if (r.status !== 0) {
    console.error(`\nFailed on "${name}". Fix the error above, then re-run from this migration or ask for help.`);
    process.exit(r.status ?? 1);
  }
}

console.log("\nDone. Run: npm run db:migrate");
process.exit(0);
