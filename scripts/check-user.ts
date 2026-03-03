/**
 * 특정 이메일 계정이 DB에 있는지, 비밀번호 해시 형식은 어떤지 확인하는 스크립트.
 * 사용: npx tsx scripts/check-user.ts lookathetop@naver.com
 * (또는 이메일 없이 실행 시 lookathetop@naver.com 기본 사용)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const email = process.argv[2] ?? "lookathetop@naver.com";
const normalized = email.trim().toLowerCase();

async function main() {
  console.log("이메일 분석:", JSON.stringify({ 입력: email, 정규화: normalized }));

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      password: true,
    },
  });

  if (!user) {
    console.log("결과: 해당 이메일로 등록된 사용자가 없습니다.");
    console.log("  → /signup 에서 먼저 가입하세요.");
    return;
  }

  const hash = user.password;
  const isBcrypt = hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$");
  const hashLen = hash.length;

  console.log("결과: 사용자 존재");
  console.log("  id:", user.id);
  console.log("  email:", user.email);
  console.log("  name:", user.name);
  console.log("  role:", user.role);
  console.log("  createdAt:", user.createdAt);
  console.log("  비밀번호 해시: bcrypt 형식?", isBcrypt, "| 길이:", hashLen, "| 앞 10자:", hash.slice(0, 10));

  if (!isBcrypt || hashLen !== 60) {
    console.log("  ⚠️ 해시가 bcrypt가 아니거나 길이가 60이 아님 → 로그인 compare 실패 원인일 수 있음.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
