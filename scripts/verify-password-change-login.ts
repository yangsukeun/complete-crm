/**
 * 관리자 재설정·본인(프로필과 동일 해싱) 경로 각각 변경 → 로그인 compare 성공.
 * 8자 미만은 거부. 임시 계정은 끝나면 삭제.
 */
import { compare, hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { hashPasswordForStore, updateEmployeePassword } from "../src/lib/employee-password";

const prisma = new PrismaClient();
const EMAIL = "pwd.change.verify@complete.local";

async function storedHash(id: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id }, select: { password: true } })).password;
}

async function main() {
  const oldPlain = "OldPass!1";
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "비번검증임시",
      password: await hash(oldPlain, 10),
      role: "USER",
      department: "CS팀",
    },
    select: { id: true },
  });

  try {
    const tooShort = await updateEmployeePassword({
      targetId: user.id,
      managerRole: "ADMIN",
      password: "short7!",
    });
    if (tooShort.ok) throw new Error("8자 미만이 통과함");

    const adminNew = "AdminNew!2";
    const adminResult = await updateEmployeePassword({
      targetId: user.id,
      managerRole: "ADMIN",
      password: adminNew,
    });
    if (!adminResult.ok) throw new Error(adminResult.error);
    const afterAdmin = await storedHash(user.id);
    if (!afterAdmin.startsWith("$2")) throw new Error("bcrypt 해시가 아님");
    if (!(await compare(adminNew, afterAdmin))) throw new Error("관리자 경로 새 비번 로그인 비교 실패");
    if (await compare(oldPlain, afterAdmin)) throw new Error("관리자 경로: 이전 비번이 통과함");
    console.log("ADMIN_PASSWORD_CHANGE_LOGIN_OK");

    const selfNew = "SelfNew!3";
    const selfHashed = await hashPasswordForStore(selfNew);
    if (!selfHashed.ok) throw new Error(selfHashed.error);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: selfHashed.hashed },
    });
    const afterSelf = await storedHash(user.id);
    if (!(await compare(selfNew, afterSelf))) throw new Error("본인 경로 새 비번 로그인 비교 실패");
    if (await compare(adminNew, afterSelf)) throw new Error("본인 경로: 이전 비번이 통과함");
    console.log("SELF_PASSWORD_CHANGE_LOGIN_OK");
  } finally {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
