/**
 * CS 링크 허브 실제 데이터 시드
 *
 * - name 기준 upsert (기존 clickCount 보존)
 * - 시드에 없는 플레이스홀더("도구 XX" 등)는 삭제
 *
 * 실행: npx tsx prisma/seed-cs-tools.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TOOLS: {
  name: string;
  url: string;
  category: string;
  description: string;
  order: number;
  isActive: boolean;
}[] = [
  {
    name: "CS 통합 관리 시스템",
    url: "https://gemini.google.com/share/a6416a616b6f",
    category: "관리·보고",
    description: "일일 업무 보고, 담당자 부하 현황, 업체 특징 관리, 회의록",
    order: 1,
    isActive: true,
  },
  {
    name: "CS 매뉴얼 양식",
    url: "https://gemini.google.com/share/f268b6594334",
    category: "매뉴얼",
    description: "매뉴얼 CSV 파일 등록 후, 매뉴얼 자동 찾기 기능",
    order: 2,
    isActive: true,
  },
  {
    name: "CS 연차 관리 시스템",
    url: "https://gemini.google.com/share/c0a184c04013",
    category: "관리·보고",
    description: "휴가 신청 및 결재",
    order: 3,
    isActive: true,
  },
  {
    name: "통신사 응대율 성과 분석",
    url: "https://gemini.google.com/share/682dbd9d1c9c",
    category: "통계·분석",
    description: "SKT, LGU+ 데이터 분석",
    order: 4,
    isActive: true,
  },
  {
    name: "익명 게시판·자료실·공지",
    url: "https://gemini.google.com/share/d2ff03780f88",
    category: "커뮤니티",
    description: "익명 게시판, 자료실, 공지 툴",
    order: 5,
    isActive: true,
  },
  {
    name: "CS 체크리스트",
    url: "https://gemini.google.com/share/3c8930fbe817",
    category: "교육",
    description: "체크리스트 신입 교육",
    order: 6,
    isActive: true,
  },
  {
    name: "공고문 조사",
    url: "https://gemini.google.com/share/636704be0397",
    category: "기타",
    description: "나라, 공공 기관 사업 조사",
    order: 7,
    isActive: true,
  },
  {
    name: "CS문의 답변 생성기",
    url: "https://gemini.google.com/share/bd2b0a5dff1c",
    category: "AI 답변생성",
    description: "제미나이를 통해 문의에 맞는 답변 생성",
    order: 8,
    isActive: true,
  },
  {
    name: "메모패치 답변 생성기",
    url: "https://gemini.google.com/share/e7d528eb3bc2",
    category: "AI 답변생성",
    description: "메모패치 답변 생성기",
    order: 9,
    isActive: true,
  },
  {
    name: "이볼루션 답변 생성기",
    url: "https://gemini.google.com/share/61b2186be381",
    category: "AI 답변생성",
    description: "이볼루션 답변 생성기",
    order: 10,
    isActive: true,
  },
  {
    name: "이미지 텍스트 추출",
    url: "https://gemini.google.com/share/7e9813523878",
    category: "AI 답변생성",
    description: "이미지 텍스트 추출",
    order: 11,
    isActive: true,
  },
  {
    name: "매뉴얼 양식 요청 파일",
    url: "https://gemini.google.com/share/2d8819dc8b3d",
    category: "매뉴얼",
    description: "업데이트 중",
    order: 12,
    isActive: false,
  },
  {
    name: "하이퍼코드 응대 고도화",
    url: "https://gemini.google.com/share/cf68448c945d",
    category: "AI 답변생성",
    description: "하이퍼코드 응대 고도화",
    order: 13,
    isActive: true,
  },
  {
    name: "구글 일일 보고서 보고서화",
    url: "https://gemini.google.com/share/cb9b0f05a809",
    category: "관리·보고",
    description: "구글 일일 보고서 보고서화",
    order: 14,
    isActive: true,
  },
  {
    name: "월간 보고서",
    url: "https://gemini.google.com/share/8b5e0218ea12",
    category: "관리·보고",
    description: "CSV 파일 등록하면 월간 보고서 생성",
    order: 15,
    isActive: true,
  },
  {
    name: "이달의 사원 투표",
    url: "https://gemini.google.com/share/52674ba62ead?skid=035b6017-f091-49e3-ada2-fe59fde5a38d",
    category: "커뮤니티",
    description: "이달의 사원 투표",
    order: 16,
    isActive: true,
  },
  {
    name: "준앤줄라이 통신사 데이터",
    url: "https://gemini.google.com/share/6ef198a0c751",
    category: "통계·분석",
    description: "준앤줄라이 통신사 데이터",
    order: 17,
    isActive: true,
  },
  {
    name: "구글 시트 연동 보고서",
    url: "https://share.gemini.google/6AdHVSxGabL4",
    category: "관리·보고",
    description: "시트 URL 넣고 양식에 맞춰 가져오기 → HTML 변환",
    order: 18,
    isActive: true,
  },
];

async function main() {
  const existing = await prisma.csTool.findMany({
    select: { id: true, name: true, clickCount: true },
  });
  const byName = new Map(existing.map((r) => [r.name, r]));
  const seedNames = new Set(TOOLS.map((t) => t.name));

  let upserted = 0;
  for (const tool of TOOLS) {
    const prev = byName.get(tool.name);
    if (prev) {
      await prisma.csTool.update({
        where: { id: prev.id },
        data: {
          url: tool.url,
          category: tool.category,
          description: tool.description,
          order: tool.order,
          isActive: tool.isActive,
          // clickCount 보존
        },
      });
    } else {
      await prisma.csTool.create({
        data: {
          ...tool,
          clickCount: 0,
        },
      });
    }
    upserted += 1;
  }

  // 플레이스홀더·시드에 없는 항목 정리
  const orphans = existing.filter((r) => !seedNames.has(r.name));
  const placeholderOrphans = orphans.filter(
    (r) => /^도구\s*\d+$/i.test(r.name.trim()) || r.name.startsWith("도구 ")
  );
  let deleted = 0;
  if (placeholderOrphans.length > 0) {
    const del = await prisma.csTool.deleteMany({
      where: { id: { in: placeholderOrphans.map((r) => r.id) } },
    });
    deleted = del.count;
  }

  const after = await prisma.csTool.findMany({
    orderBy: { order: "asc" },
    select: { name: true, category: true, isActive: true, order: true, clickCount: true },
  });
  const active = after.filter((r) => r.isActive);

  console.log(
    JSON.stringify(
      {
        upserted,
        deletedPlaceholders: deleted,
        otherOrphansKept: orphans.filter((r) => !placeholderOrphans.includes(r)).map((r) => r.name),
        total: after.length,
        activeCount: active.length,
        categories: [...new Set(after.map((r) => r.category))],
        rows: after,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
