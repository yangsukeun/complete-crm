/**
 * 삭제된 계정 복구 + 해당 계정이 작성한 견적서·이체 요청(기안) 복원
 *
 * 1) 계정이 아직 없으면 해당 이메일로 사용자 생성 (임시 비밀번호)
 * 2) issuedById/requesterId가 null인 견적서·이체요청을 이 사용자로 연결
 *
 * ※ 계정 삭제가 "데이터 유지(SetNull)" 마이그레이션 이전이었다면
 *    견적/이체 데이터는 이미 CASCADE로 삭제되어 복원 불가능합니다.
 *
 * 사용법: npx tsx scripts/restore-deleted-user.ts bscomte20@gmail.com
 *        npx tsx scripts/restore-deleted-user.ts bscomte20@gmail.com "홍길동"
 *        (이름 생략 시 "복원 사용자"로 생성)
 */
import "dotenv/config";
import { hash } from "bcryptjs";
import prisma from "../src/lib/prisma";

const EMAIL = process.argv[2]?.trim()?.toLowerCase();
const NAME = process.argv[3]?.trim() || "복원 사용자";
const TEMP_PASSWORD = "RestoreTemp1!";

async function main() {
  if (!EMAIL) {
    console.log("사용법: npx tsx scripts/restore-deleted-user.ts <이메일> [이름]");
    console.log("예: npx tsx scripts/restore-deleted-user.ts bscomte20@gmail.com");
    process.exit(1);
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: EMAIL },
  });
  if (existingUser) {
    console.log(`이미 존재하는 계정입니다: ${EMAIL}`);
    console.log("견적서/이체 요청만 복원하려면, DB에서 해당 사용자 id로 issuedById/requesterId를 직접 연결하세요.");
    process.exit(0);
  }

  const orphanQuotations = await prisma.quotation.count({ where: { issuedById: null } });
  const orphanRequests = await prisma.paymentRequest.count({ where: { requesterId: null } });

  const hashedPassword = await hash(TEMP_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      password: hashedPassword,
      name: NAME,
      role: "USER",
    },
  });

  const u1 = await prisma.quotation.updateMany({
    where: { issuedById: null },
    data: { issuedById: user.id },
  });
  const u2 = await prisma.paymentRequest.updateMany({
    where: { requesterId: null },
    data: { requesterId: user.id },
  });

  console.log("--- 복구 완료 ---");
  console.log(`계정: ${user.email} (이름: ${user.name})`);
  console.log(`임시 비밀번호: ${TEMP_PASSWORD}`);
  console.log("로그인 후 반드시 비밀번호를 변경하세요.");
  console.log(`견적서 복원: ${u1.count}건 (DB에 issuedById가 비어 있던 건)`);
  console.log(`이체(기안) 요청 복원: ${u2.count}건 (DB에 requesterId가 비어 있던 건)`);
  if (orphanQuotations === 0 && orphanRequests === 0) {
    console.log("");
    console.log("※ DB에 발행자/요청자가 비어 있는 데이터가 없었습니다.");
    console.log("  계정 삭제가 '데이터 유지' 마이그레이션 이전이었다면 견적/이체 데이터는 이미 삭제된 상태입니다.");
    console.log("  백업이 있다면 DB 백업 복원만 가능합니다.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
