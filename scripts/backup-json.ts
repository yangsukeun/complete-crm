/**
 * Prisma JSON 전체 백업 (pg_dump 없을 때 대체).
 * 사용: npx tsx scripts/backup-json.ts
 *
 * 출력: backups/YYYYMMDD/<Model>.json
 * BigInt → string. 커밋 금지(backups/ 는 .gitignore).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function modelToDelegateKey(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}

async function main() {
  const stamp = todayStamp();
  const outDir = path.join(process.cwd(), "backups", stamp);
  fs.mkdirSync(outDir, { recursive: true });

  const models = Prisma.dmmf.datamodel.models.map((m) => m.name).sort();
  console.log(`=== Prisma JSON 백업 → ${outDir}`);
  console.log(`모델 수: ${models.length}\n`);

  const summary: { model: string; rows: number; bytes: number }[] = [];

  for (const modelName of models) {
    const key = modelToDelegateKey(modelName);
    const delegate = (prisma as unknown as Record<string, { findMany?: () => Promise<unknown[]> }>)[
      key
    ];
    if (!delegate?.findMany) {
      console.warn(`SKIP (delegate 없음): ${modelName} → prisma.${key}`);
      continue;
    }

    process.stdout.write(`… ${modelName} `);
    const rows = await delegate.findMany();
    const filePath = path.join(outDir, `${modelName}.json`);
    const text = JSON.stringify(rows, jsonReplacer, 2);
    fs.writeFileSync(filePath, text, "utf8");
    const bytes = Buffer.byteLength(text, "utf8");
    summary.push({ model: modelName, rows: rows.length, bytes });
    console.log(`${rows.length}행, ${(bytes / 1024).toFixed(1)} KB`);
  }

  const totalRows = summary.reduce((a, s) => a + s.rows, 0);
  const totalBytes = summary.reduce((a, s) => a + s.bytes, 0);
  console.log("\n--- 테이블별 행 수 ---");
  for (const s of summary) {
    console.log(`${s.model.padEnd(32)} ${String(s.rows).padStart(8)}`);
  }
  console.log("---");
  console.log(`합계 행: ${totalRows}`);
  console.log(`합계 크기: ${(totalBytes / 1024 / 1024).toFixed(2)} MB (${totalBytes} bytes)`);
  console.log(`디렉터리: ${outDir}`);
  console.log("\n※ backups/ 는 git에 올리지 마세요. 구글 드라이브에 수동 업로드하세요.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
