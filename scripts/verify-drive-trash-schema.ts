import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
async function main() {
  const cols = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='DriveFile' AND column_name IN ('trashed','trashedAt','trashedBy','updatedBy')
     ORDER BY 1`
  );
  console.log("DriveFile cols:", cols.map((c) => c.column_name).join(", "));
  const enums = await p.$queryRawUnsafe<{ enumlabel: string }[]>(
    `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='DriveActivityAction' ORDER BY 1`
  );
  console.log(
    "DriveActivityAction:",
    enums.map((e) => e.enumlabel).join(", ")
  );
  const table = await p.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='DriveActivityLog') as exists`
  );
  console.log("DriveActivityLog table:", table[0]?.exists);
}
main()
  .catch(console.error)
  .finally(() => p.$disconnect());
