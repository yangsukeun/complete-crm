/* One-time: copy Task.assignedToId into TaskAssignee */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const tasks = await prisma.task.findMany({
      where: { assignedToId: { not: null } },
      select: { id: true, assignedToId: true },
    });
    const result = await prisma.taskAssignee.createMany({
      data: tasks.map((t) => ({ taskId: t.id, userId: t.assignedToId })),
      skipDuplicates: true,
    });
    console.log("TaskAssignee backfill count:", result.count);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
