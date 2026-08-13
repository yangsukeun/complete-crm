/**
 * CS팀 부서·직책 마스터 시드 (+ 검증용 테스트 계정 옵션)
 *
 *   npx tsx prisma/seed-cs-org.ts
 *   npx tsx prisma/seed-cs-org.ts --with-test-users
 */
import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const withTestUsers = process.argv.includes("--with-test-users");

async function ensureDepartment(name: string, sortOrder: number) {
  const existing = await prisma.department.findFirst({ where: { name } });
  if (existing) {
    await prisma.department.update({
      where: { id: existing.id },
      data: { sortOrder },
    });
    return existing.id;
  }
  const created = await prisma.department.create({ data: { name, sortOrder } });
  return created.id;
}

async function ensurePosition(name: string, sortOrder: number) {
  const existing = await prisma.position.findFirst({ where: { name } });
  if (existing) {
    await prisma.position.update({
      where: { id: existing.id },
      data: { sortOrder },
    });
    return existing.id;
  }
  const created = await prisma.position.create({ data: { name, sortOrder } });
  return created.id;
}

async function ensureTestUser(opts: {
  email: string;
  name: string;
  role: "USER" | "TEAM_LEAD" | "CENTER_CHIEF";
  department: string;
  position: string;
}) {
  const password = await hash("Test1234!", 10);
  const existing = await prisma.user.findUnique({ where: { email: opts.email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: opts.name,
        role: opts.role,
        department: opts.department,
        position: opts.position,
        permissions: null,
        accountDisabled: false,
      },
    });
    return existing.id;
  }
  const created = await prisma.user.create({
    data: {
      email: opts.email,
      password,
      name: opts.name,
      role: opts.role,
      department: opts.department,
      position: opts.position,
      permissions: null,
    },
  });
  return created.id;
}

async function main() {
  await ensureDepartment("CS팀", 4);
  await ensurePosition("CS", 9);
  await ensurePosition("CS팀장", 10);
  await ensurePosition("센터장", 11);

  const result: Record<string, unknown> = {
    departments: await prisma.department.findMany({
      orderBy: { sortOrder: "asc" },
      select: { name: true, sortOrder: true },
    }),
    positions: await prisma.position.findMany({
      orderBy: { sortOrder: "asc" },
      select: { name: true, sortOrder: true },
    }),
  };

  if (withTestUsers) {
    const ids = {
      csUser: await ensureTestUser({
        email: "cs.user.test@complete.local",
        name: "CS테스트직원",
        role: "USER",
        department: "CS팀",
        position: "AD",
      }),
      csLead: await ensureTestUser({
        email: "cs.lead.test@complete.local",
        name: "CS테스트팀장",
        role: "TEAM_LEAD",
        department: "CS팀",
        position: "CS팀장",
      }),
      csChief: await ensureTestUser({
        email: "cs.chief.test@complete.local",
        name: "CS테스트센터장",
        role: "CENTER_CHIEF",
        department: "CS팀",
        position: "센터장",
      }),
    };
    result.testUsers = {
      ...ids,
      password: "Test1234!",
    };
  }

  // enum 검증
  const roleCheck = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
    `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'Role' ORDER BY enumsortorder`
  );
  const statusCheck = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
    `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'PaymentRequestStatus' ORDER BY enumsortorder`
  );
  result.roleEnum = roleCheck.map((r) => r.enumlabel);
  result.paymentStatusEnum = statusCheck.map((r) => r.enumlabel);

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
