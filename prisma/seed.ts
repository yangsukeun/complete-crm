import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 마스터(초기 관리자) 계정 1개만 생성/갱신
  const masterEmail = (process.env.MASTER_EMAIL ?? "admin@complete.co.kr").trim().toLowerCase();
  const masterPassword = (process.env.MASTER_PASSWORD ?? "1234").trim();
  const masterName = (process.env.MASTER_NAME ?? "마스터").trim() || "마스터";

  const hashed = await hash(masterPassword, 10);
  await prisma.user.upsert({
    where: { email: masterEmail },
    update: { password: hashed, name: masterName, role: "ADMIN" },
    create: {
      email: masterEmail,
      password: hashed,
      name: masterName,
      role: "ADMIN",
    },
  });
  // 직책: 경영관리 매니저, PP 추가
  const positionNames = ["경영관리 매니저", "PP"];
  for (const name of positionNames) {
    const existing = await prisma.position.findFirst({ where: { name } });
    if (!existing) {
      const maxOrder = await prisma.position.aggregate({ _max: { sortOrder: true } });
      await prisma.position.create({
        data: { name, sortOrder: (maxOrder?._max?.sortOrder ?? 0) + 1 },
      });
    }
  }
  console.log(`Seed 완료(마스터): ${masterEmail} / ${masterPassword}`);
  console.log("직책 추가: 경영관리 매니저, PP");

  /** 마인드맵 데모: 제목에「사무자동화」가 포함된 업무 위에「비지니스」상위 노드 삽입 (없으면 건너뜀) */
  const childTask = await prisma.task.findFirst({
    where: {
      deletedAt: null,
      title: { contains: "사무자동화" },
    },
    select: {
      id: true,
      title: true,
      parentId: true,
      scope: true,
      dueDate: true,
      createdById: true,
      assignedToId: true,
    },
  });
  if (childTask) {
    const alreadyBizParent = await prisma.task.findFirst({
      where: {
        deletedAt: null,
        title: "비지니스",
        children: { some: { id: childTask.id } },
      },
      select: { id: true },
    });
    if (!alreadyBizParent) {
      const assigneeRows = await prisma.taskAssignee.findMany({
        where: { taskId: childTask.id },
        select: { userId: true },
      });
      const assigneeIds = assigneeRows.map((r) => r.userId);
      const primary =
        childTask.assignedToId ?? assigneeIds[0] ?? childTask.createdById ?? undefined;
      const creator = childTask.createdById ?? primary;
      if (creator && primary) {
        const parent = await prisma.task.create({
          data: {
            title: "비지니스",
            description: null,
            dueDate: childTask.dueDate,
            scope: childTask.scope,
            parentId: childTask.parentId,
            createdById: creator,
            assignedToId: primary,
            assignees: {
              create: [...new Set(assigneeIds.length > 0 ? assigneeIds : [primary])].map((userId) => ({
                userId,
              })),
            },
          },
          select: { id: true },
        });
        await prisma.task.update({
          where: { id: childTask.id },
          data: { parentId: parent.id },
        });
        console.log(
          `마인드맵 시드: "${childTask.title}" 상위에 "비지니스" 노드 연결 (${parent.id})`
        );
      }
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
