/**
 * 직원 비밀번호 변경 후 로그인 비교가 성공하는지 검증.
 * 임시 계정을 만들고 끝나면 삭제한다. CS 실계정은 건드리지 않는다.
 *
 * 사용: npx tsx scripts/verify-password-change-login.ts
 */
import { compare, hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { updateEmployeePassword } from "../src/lib/employee-password";

const prisma = new PrismaClient();
const EMAIL = "pwd.change.verify@complete.local";

async function main() {
  const oldPlain = "OldPass!1";
  const newPlain = "NewPass!2";
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
    const oldOk = await compare(
      oldPlain,
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { password: true } })).password
    );
    if (!oldOk) throw new Error("초기 비밀번호 compare 실패");

    const result = await updateEmployeePassword({
      targetId: user.id,
      managerRole: "ADMIN",
      password: newPlain,
    });
    if (!result.ok) throw new Error(result.error);

    const stored = (
      await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { password: true } })
    ).password;
    if (!stored.startsWith("$2")) throw new Error("bcrypt 해시가 아님");
    const newOk = await compare(newPlain, stored);
    const oldStill = await compare(oldPlain, stored);
    if (!newOk) throw new Error("새 비밀번호 로그인 비교 실패");
    if (oldStill) throw new Error("이전 비밀번호가 여전히 통과함");
    console.log("PASSWORD_CHANGE_LOGIN_OK");
  } finally {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
