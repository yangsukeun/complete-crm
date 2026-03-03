import "dotenv/config";
import { defineConfig } from "prisma/config";

// Supabase 등 외부 Postgres는 SSL 필요. URL에 sslmode가 없으면 추가 (P1001 방지).
function normalizeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("supabase") || /[?&]sslmode=/i.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}sslmode=require`;
}

const rawUrl = process.env["DATABASE_URL"];
const databaseUrl = normalizeDatabaseUrl(rawUrl);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
