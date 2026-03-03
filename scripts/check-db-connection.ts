/**
 * DB(Supabase) 연동 확인 스크립트
 * 사용: npm run check-db
 * - .env의 DATABASE_URL로 연결되는지 확인
 * - User 테이블에 있는 이메일 목록 출력 (로그인 시 정확한 이메일 확인용)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== DB 연동 확인 (Supabase / Prisma) ===\n");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL이 .env에 없습니다.");
    console.log("  Supabase 대시보드 → Project Settings → Database → Connection string (URI) 복사 후 .env에 넣으세요.");
    process.exit(1);
  }

  const safeUrl = dbUrl.replace(/:[^:@]+@/, ":****@");
  console.log("1. 환경 변수:", safeUrl.substring(0, 60) + "...");
  console.log("");

  try {
    await prisma.$connect();
    console.log("2. 연결: ✅ 성공 (Prisma가 Supabase에 접속했습니다.)\n");
  } catch (e) {
    console.error("2. 연결: ❌ 실패");
    console.error(e);
    console.log("\n확인할 것:");
    console.log("  - .env의 DATABASE_URL이 Supabase 프로젝트의 Connection string과 동일한지");
    console.log("  - Supabase → Settings → Database 에서 'Connection string' 복사 (URI, Transaction 모드 권장)");
    console.log("  - 비밀번호에 특수문자 있으면 URL 인코딩 필요");
    process.exit(1);
  }

  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    console.log("3. User 테이블:", users.length, "명");
    if (users.length === 0) {
      console.log("   → 테이블 편집기에서 계정을 추가했거나, 앱 /signup 으로 먼저 가입하세요.");
    } else {
      console.log("   로그인 시 아래 이메일을 **그대로 복사**해서 사용하세요:\n");
      users.forEach((u, i) => {
        console.log(`   [${i + 1}] 이메일: ${u.email}  |  이름: ${u.name}  |  역할: ${u.role}`);
      });
      console.log("\n   ⚠️ 이메일 오타 주의 (예: lookathetop vs lookatthatop)");
    }
    console.log("");
    console.log("=== 연동 정상이면 위 이메일로 로그인하면 됩니다. ===");
  } catch (e) {
    console.error("3. User 조회 실패 (테이블이 없거나 스키마 불일치):", e);
    console.log("\n  해결: Supabase SQL Editor에서 prisma/supabase-schema.sql 내용 실행해 테이블 생성 후, 터미널에서 npx prisma generate 실행");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
