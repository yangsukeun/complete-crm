/**
 * 대표 계정 역할을 ADMIN으로 설정합니다.
 * 사용법: npx tsx scripts/set-executive-role.ts
 * 또는: npx tsx scripts/set-executive-role.ts someone@email.com
 */
import "dotenv/config";
import prisma from "../src/lib/prisma";

const EXECUTIVE_EMAIL = process.argv[2] ?? "lookatthetop@gmail.com";

async function main() {
  const updated = await prisma.user.updateMany({
    where: { email: EXECUTIVE_EMAIL },
    data: { role: "ADMIN" },
  });
  if (updated.count === 0) {
    console.log(`해당 이메일 사용자가 없습니다: ${EXECUTIVE_EMAIL}`);
    process.exit(1);
  }
  console.log(`역할이 ADMIN(대표/관리자)로 설정되었습니다: ${EXECUTIVE_EMAIL}`);
  console.log("다시 로그인하면 결제 요청 내역이 보입니다.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
