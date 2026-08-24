import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
async function main() {
  const exists = await p.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='DriveTeamShare') as exists`
  );
  console.log("DriveTeamShare:", exists[0]?.exists);
  const n = await p.driveTeamShare.count();
  console.log("rules count:", n);
}
main()
  .catch(console.error)
  .finally(() => p.$disconnect());
