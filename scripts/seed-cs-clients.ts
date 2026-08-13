import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  CS_CLIENT_ALIASES,
  CS_CLIENT_ASSIGNMENT_SEED,
  CS_CLIENT_SEED,
} from "../src/lib/cs-client-seed-data";

const prisma = new PrismaClient();

async function main() {
  let upserted = 0;
  for (const [name, startDate, endDate, note] of CS_CLIENT_SEED) {
    await prisma.csClient.upsert({
      where: { name },
      create: {
        name,
        startDate: startDate || null,
        endDate: endDate || null,
        note: note || null,
        isActive: !endDate,
      },
      update: {
        startDate: startDate || null,
        endDate: endDate || null,
        note: note || null,
        isActive: !endDate,
      },
    });
    upserted += 1;
  }

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const byName = new Map(users.map((u) => [u.name, u]));
  const clients = await prisma.csClient.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const byClient = new Map(clients.map((c) => [c.name, c]));

  const skipped: string[] = [];
  let assigned = 0;
  for (const row of CS_CLIENT_ASSIGNMENT_SEED) {
    const user = byName.get(row.person);
    const clientName = CS_CLIENT_ALIASES[row.client] ?? row.client;
    const client = byClient.get(clientName);
    if (!user) {
      skipped.push(`${row.person} / ${row.client} (사람 없음)`);
      continue;
    }
    if (!client) {
      skipped.push(`${row.person} / ${row.client} (업체 없음: ${clientName})`);
      continue;
    }
    await prisma.csClientAssignment.upsert({
      where: { clientId_userId: { clientId: client.id, userId: user.id } },
      create: { clientId: client.id, userId: user.id, roleLabel: row.roleLabel },
      update: { roleLabel: row.roleLabel },
    });
    assigned += 1;
  }

  const total = await prisma.csClient.count({ where: { deletedAt: null } });
  const assignCount = await prisma.csClientAssignment.count();
  console.log(JSON.stringify({ upserted, total, assigned, assignCount, skipped }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
