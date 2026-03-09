import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 마스터(초기 관리자) 계정 1개만 생성/갱신
  const masterEmail = (process.env.MASTER_EMAIL ?? "admin@complete.co.kr").trim().toLowerCase();
  const masterPassword = (process.env.MASTER_PASSWORD ?? "1234").trim();
  const masterName = (process.env.MASTER_NAME ?? "마스터").trim() || "마스터";

  const hashed = await hash(masterPassword, 10);
  await prisma.user.upsert({
    where: { email: masterEmail },
    update: { password: hashed, name: masterName, role: "ADMIN" },
    create: {
      email: masterEmail,
      password: hashed,
      name: masterName,
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
  console.log(`Seed 완료(마스터): ${masterEmail} / ${masterPassword}`);
  console.log("직책 추가: 경영관리 매니저, PP");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
