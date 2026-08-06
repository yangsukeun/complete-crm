/**
 * 테스트용 BoardPost 일괄 삭제 (프로덕션 DATABASE_URL).
 * 제목 화이트리스트 AND createdAt = 2026-08-06(UTC 일자)만 대상.
 *
 * 실행: npx tsx scripts/cleanup-test-posts.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  collectGoogleDriveFileIdsFromText,
  parseGoogleDriveFileIdFromUrl,
} from "../src/lib/google-drive-url-utils";

const prisma = new PrismaClient();

const TITLES = [
  "P0-prod-1",
  "P0-prod-2",
  "P0-prod-3",
  "P0-prod-4",
  "P0-prod-5-edited",
  "P0-prod-diag",
  "svg",
  "rich",
  "anon",
  "personal",
  "empty-desc",
  "test",
] as const;

/** 2026-08-06 00:00:00 UTC ~ 2026-08-07 00:00:00 UTC */
const DAY_START = new Date("2026-08-06T00:00:00.000Z");
const DAY_END = new Date("2026-08-07T00:00:00.000Z");

function parseAttachments(raw: string | null | undefined): { url: string; name: string }[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is { url?: string; name?: string } => x != null && typeof x === "object")
      .map((x) => ({
        url: typeof x.url === "string" ? x.url : "",
        name: typeof x.name === "string" ? x.name : "파일",
      }))
      .filter((x) => x.url.length > 0);
  } catch {
    return [];
  }
}

async function main() {
  console.log("=== 테스트 BoardPost 정리 ===");
  console.log("대상 DB: DATABASE_URL 설정 여부", Boolean(process.env.DATABASE_URL));
  console.log("제목:", TITLES.join(", "));
  console.log("createdAt 범위(UTC):", DAY_START.toISOString(), "~", DAY_END.toISOString());
  console.log("");

  const posts = await prisma.boardPost.findMany({
    where: {
      title: { in: [...TITLES] },
      createdAt: { gte: DAY_START, lt: DAY_END },
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      attachments: true,
      description: true,
      createdBy: { select: { id: true, name: true, email: true } },
      _count: {
        select: { comments: true, revisions: true, driveFiles: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (posts.length === 0) {
    console.log("매칭 글 없음. 종료.");
    return;
  }

  console.log(`--- 삭제 예정 ${posts.length}건 ---`);
  for (const p of posts) {
    console.log(
      `- ${p.id} | "${p.title}" | ${p.createdBy?.name ?? "?"} <${p.createdBy?.email ?? ""}> | ${p.createdAt.toISOString()} | comments=${p._count.comments} revisions=${p._count.revisions} postDriveFiles=${p._count.driveFiles}`
    );

    const driveIds = new Set<string>();
    for (const a of parseAttachments(p.attachments)) {
      const fid = parseGoogleDriveFileIdFromUrl(a.url);
      if (fid) driveIds.add(fid);
    }
    for (const fid of collectGoogleDriveFileIdsFromText(p.description ?? "")) {
      driveIds.add(fid);
    }
    if (driveIds.size > 0) {
      console.log(`  ⚠ Drive 첨부/본문 링크 ID (${driveIds.size}): ${[...driveIds].join(", ")}`);
      console.log("  → Drive 파일은 삭제하지 않음 (보고만)");
    } else {
      console.log("  첨부 Drive ID: 없음");
    }
  }

  console.log("");
  console.log(
    "관계: BoardPostComment / BoardPostRevision / PostDriveFile 는 onDelete: Cascade → hard delete 시 자식 자동 삭제"
  );
  console.log("삭제 실행 (hard delete)...");

  const ids = posts.map((p) => p.id);
  const result = await prisma.boardPost.deleteMany({
    where: { id: { in: ids } },
  });

  console.log(`삭제된 글 수: ${result.count}`);

  const remaining = await prisma.boardPost.findMany({
    where: {
      title: { in: [...TITLES] },
      createdAt: { gte: DAY_START, lt: DAY_END },
    },
    select: { id: true, title: true },
  });
  console.log(`남은 매칭 글: ${remaining.length}건`);
  if (remaining.length > 0) {
    console.log(remaining);
    process.exitCode = 1;
  } else {
    console.log("OK: 남은 매칭 글 0건");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
