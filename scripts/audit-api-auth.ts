/**
 * API 라우트 정적 권한 감사 (수정 없음, 보고용).
 * 사용: npx tsx scripts/audit-api-auth.ts
 *
 * [A] 세션 + 권한 패턴 둘 다
 * [B] 세션만
 * [C] 둘 다 없음 ← 위험 후보
 */
import fs from "fs";
import path from "path";

const API_ROOT = path.join(process.cwd(), "app", "api");

/** 세션/인증 확인으로 보는 패턴 */
const SESSION_RE =
  /\b(getAppSession|getServerSession|requireAuth|requireSession|authSafe|getAuthSession)\s*\(|\bauth\s*\(/;

/** 역할·관리자 권한 확인으로 보는 패턴 (느슨한 휴리스틱) */
const ROLE_RE =
  /\b(isAdmin|isExecutive|isMasterSession|requireAdmin|requireRole|assertAdmin|checkAdmin|hasPermission|canAccess|assertUserCan|boardVisibilityWhere|canUserView)\b|\.role\b|role\s*===|role\s*!==|includes\(\s*role|['"]ADMIN['"]|['"]EXECUTIVE['"]|['"]TEAM_LEAD['"]|CRON_SECRET|verifyCronRequest|Authorization/;

type Grade = "A" | "B" | "C";

type Row = {
  rel: string;
  grade: Grade;
  hasSession: boolean;
  hasRole: boolean;
  isAdminPath: boolean;
};

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name === "route.ts" || name === "route.js") out.push(full);
  }
  return out;
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function classify(filePath: string): Row {
  const src = fs.readFileSync(filePath, "utf8");
  // 주석 줄은 대략 제거 (휴리스틱)
  const code = src
    .split(/\r?\n/)
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");

  const hasSession = SESSION_RE.test(code);
  const hasRole = ROLE_RE.test(code);
  let grade: Grade = "C";
  if (hasSession && hasRole) grade = "A";
  else if (hasSession) grade = "B";

  const rel = toPosix(path.relative(process.cwd(), filePath));
  const isAdminPath = /app\/api\/admin\//.test(rel);

  return { rel, grade, hasSession, hasRole, isAdminPath };
}

function main() {
  const files = walk(API_ROOT).sort();
  const rows = files.map(classify);

  const a = rows.filter((r) => r.grade === "A");
  const b = rows.filter((r) => r.grade === "B");
  const c = rows.filter((r) => r.grade === "C");
  const adminB = b.filter((r) => r.isAdminPath);
  const adminC = c.filter((r) => r.isAdminPath);

  console.log("=== API 권한 정적 감사 ===");
  console.log(`총 route 파일: ${rows.length}`);
  console.log(`[A] 세션+권한: ${a.length}`);
  console.log(`[B] 세션만:   ${b.length}`);
  console.log(`[C] 둘 다 없음: ${c.length}`);
  console.log(`admin 하위 [B]: ${adminB.length}`);
  console.log(`admin 하위 [C]: ${adminC.length}`);

  console.log("\n========== [C] 세션·권한 둘 다 없음 ==========");
  for (const r of c) {
    const tag = r.isAdminPath ? " ⚠ ADMIN PATH" : "";
    console.log(`  ${r.rel}${tag}`);
  }

  console.log("\n========== admin 하위 [B] 세션만 ==========");
  if (adminB.length === 0) console.log("  (없음)");
  for (const r of adminB) console.log(`  ${r.rel}`);

  console.log("\n========== admin 하위 [C] ==========");
  if (adminC.length === 0) console.log("  (없음)");
  for (const r of adminC) console.log(`  ${r.rel}`);

  // 요약 JSON도 stdout 끝 마크
  const reportPath = path.join(process.cwd(), "scripts", "audit-api-auth-last.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totals: { all: rows.length, A: a.length, B: b.length, C: c.length },
        C: c.map((r) => r.rel),
        adminB: adminB.map((r) => r.rel),
        adminC: adminC.map((r) => r.rel),
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`\nJSON 요약: ${toPosix(path.relative(process.cwd(), reportPath))} (참고용, 커밋 대상 아님)`);
}

main();
