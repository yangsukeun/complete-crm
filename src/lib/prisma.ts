import { PrismaClient } from "@prisma/client";

// Vercel/Edge 등에서 globalThis가 null일 수 있어 .prisma 접근 시 TypeError 방지
const globalForPrisma =
  typeof globalThis !== "undefined" && globalThis != null
    ? (globalThis as unknown as { prisma: PrismaClient | undefined })
    : ({ prisma: undefined } as { prisma: PrismaClient | undefined });

function createPrisma() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production" && typeof globalThis !== "undefined" && globalThis != null) {
  (globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
}

export default prisma;
export { prisma };
