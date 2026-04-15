import "server-only";
import { Prisma } from "@prisma/client";

/** DB에 Task.color 컬럼이 없을 때 Prisma가 던지는 오류 */
export function isPrismaTaskColorColumnMissing(e: unknown): boolean {
  const msg = String(e instanceof Error ? e.message : e).toLowerCase();
  const prismaMissing =
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022";
  /** Postgres 42703, MySQL Unknown column … 등 */
  const mentionsColor =
    msg.includes("color") &&
    (msg.includes("column") ||
      msg.includes("does not exist") ||
      msg.includes("unknown column") ||
      msg.includes("field list") ||
      msg.includes("42703"));
  return prismaMissing || mentionsColor;
}
