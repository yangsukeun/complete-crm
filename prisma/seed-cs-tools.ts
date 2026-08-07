/**
 * CS 링크 허브 임시 시드
 *
 * // TODO: CS팀장 확인 후 실제 데이터로 교체 필수 — 임시 배포 금지
 *
 * 실행: npx tsx prisma/seed-cs-tools.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// TODO: CS팀장 확인 후 실제 데이터로 교체 필수 — 임시 배포 금지
const CATEGORIES = ["상담", "번역", "이미지", "문서작업", "기타"] as const;

// TODO: CS팀장 확인 후 실제 데이터로 교체 필수 — 임시 배포 금지
const PLACEHOLDER_TOOLS = Array.from({ length: 21 }, (_, i) => {
  const n = i + 1;
  const category = CATEGORIES[i % CATEGORIES.length]!;
  return {
    name: `도구 ${String(n).padStart(2, "0")}`,
    url: "https://example.com",
    category,
    description: `임시 플레이스홀더 #${n} — 실제 URL·명칭으로 교체 필요`,
    order: n,
    isActive: true,
    clickCount: 0,
  };
});

async function main() {
  // TODO: CS팀장 확인 후 실제 데이터로 교체 필수 — 임시 배포 금지
  const existing = await prisma.csTool.count();
  if (existing > 0) {
    console.log(`CsTool 이미 ${existing}건 있음 — 시드 건너뜀 (중복 방지)`);
    return;
  }

  const result = await prisma.csTool.createMany({ data: PLACEHOLDER_TOOLS });
  console.log(`CsTool 시드 ${result.count}건 생성 (플레이스홀더)`);
  console.log("TODO: CS팀장 확인 후 실제 데이터로 교체 필수 — 임시 배포 금지");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
