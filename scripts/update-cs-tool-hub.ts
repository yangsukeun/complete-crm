import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const leave = await prisma.csTool.updateMany({
    where: { name: { in: ["CS 연차 관리 시스템", "연차·휴가"] } },
    data: {
      name: "연차·휴가",
      url: "/leave",
      description: "휴가 신청·잔여 확인",
    },
  });
  const lounge = await prisma.csTool.updateMany({
    where: { name: { in: ["익명 게시판·자료실·공지", "CS 라운지"] } },
    data: {
      name: "CS 라운지",
      url: "/cs-lounge",
      description: "공지·익명 라운지",
    },
  });
  console.log(JSON.stringify({ leave: leave.count, lounge: lounge.count }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
