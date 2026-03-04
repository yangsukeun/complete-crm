import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashed = await hash("1234", 10);
  await prisma.user.upsert({
    where: { email: "admin@complete.co.kr" },
    update: { password: hashed },
    create: {
      email: "admin@complete.co.kr",
      password: hashed,
      name: "관리자",
      role: "ADMIN",
    },
  });
  await prisma.user.upsert({
    where: { email: "lookatthetop@gmail.com" },
    update: { password: hashed },
    create: {
      email: "lookatthetop@gmail.com",
      password: hashed,
      name: "관리자",
      role: "ADMIN",
    },
  });
  // 직책: 경영관리 매니저, PP 추가
  const positionNames = ["경영관리 매니저", "PP"];
  for (const name of positionNames) {
    const existing = await prisma.position.findFirst({ where: { name } });
    if (!existing) {
      const maxOrder = await prisma.position.aggregate({ _max: { sortOrder: true } });
      await prisma.position.create({
        data: { name, sortOrder: (maxOrder?._max?.sortOrder ?? 0) + 1 },
      });
    }
  }
  console.log("Seed 완료: admin@complete.co.kr / 1234");
  console.log("Seed 완료: lookatthetop@gmail.com / 1234");
  console.log("직책 추가: 경영관리 매니저, PP");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
