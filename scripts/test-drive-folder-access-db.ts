/**
 * DB 연동: 03 하위에 임시 부서 폴더를 만들고 접근/403 시나리오 검증 후 삭제
 */
import { PrismaClient } from "@prisma/client";
import {
  assertCanAccessDriveFileId,
  filterAccessibleDriveFiles,
  loadDriveAccessActor,
} from "../src/lib/drive/folder-access";

const prisma = new PrismaClient();

async function main() {
  const section03 = await prisma.driveFile.findFirst({
    where: { name: "03_부서별", isFolder: true, parentId: null },
  });
  if (!section03) throw new Error("03_부서별 없음");

  const mktUser = await prisma.user.findFirst({
    where: { department: "마케팅", role: { in: ["USER", "TEAM_LEAD"] } },
  });
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!mktUser || !admin) throw new Error("테스트 유저 부족");

  const tempCs = await prisma.driveFile.create({
    data: {
      name: "CS",
      isFolder: true,
      parentId: section03.id,
      driveFolderId: section03.driveFileId,
      rootId: section03.rootId,
      source: "google_drive",
      driveFileId: `test-cs-${Date.now()}`,
    },
  });
  const tempMkt = await prisma.driveFile.create({
    data: {
      name: "마케팅",
      isFolder: true,
      parentId: section03.id,
      driveFolderId: section03.driveFileId,
      rootId: section03.rootId,
      source: "google_drive",
      driveFileId: `test-mkt-${Date.now()}`,
    },
  });

  try {
    const mktActor = await loadDriveAccessActor(mktUser.id);
    const adminActor = await loadDriveAccessActor(admin.id);
    if (!mktActor || !adminActor) throw new Error("actor load fail");

    const children = await prisma.driveFile.findMany({
      where: { parentId: section03.id },
      select: { id: true, name: true, parentId: true, isFolder: true },
    });

    const mktVisible = await filterAccessibleDriveFiles(mktActor, children);
    const adminVisible = await filterAccessibleDriveFiles(adminActor, children);

    const mktNames = mktVisible.map((f) => f.name).sort();
    const adminHasCs = adminVisible.some((f) => f.id === tempCs.id);
    const mktHasCs = mktVisible.some((f) => f.id === tempCs.id);
    const mktHasMkt = mktVisible.some((f) => f.id === tempMkt.id);

    console.log("마케팅 직원 visible under 03:", mktNames);
    console.log("마케팅 sees 마케팅?", mktHasMkt, "sees CS?", mktHasCs);
    console.log("ADMIN sees CS?", adminHasCs);

    if (!mktHasMkt) throw new Error("마케팅 직원이 마케팅 폴더를 못 봄");
    if (mktHasCs) throw new Error("마케팅 직원이 CS 폴더를 보면 안 됨");
    if (!adminHasCs) throw new Error("ADMIN이 CS를 못 봄");

    const deny = await assertCanAccessDriveFileId(mktActor, tempCs.id);
    console.log("마케팅 → CS 직접 접근:", deny);
    if (deny.ok) throw new Error("CS 직접 접근이 403이어야 함");

    const allow = await assertCanAccessDriveFileId(adminActor, tempCs.id);
    if (!allow.ok) throw new Error("ADMIN CS 접근 실패");

    // root: 04 should be hidden for marketing
    const roots = await prisma.driveFile.findMany({
      where: { parentId: null, isFolder: true },
      select: { id: true, name: true, parentId: true, isFolder: true },
    });
    const mktRoots = await filterAccessibleDriveFiles(mktActor, roots);
    const mktRootNames = mktRoots.map((r) => r.name);
    console.log("마케팅 루트:", mktRootNames);
    if (mktRootNames.includes("04_영업자료")) throw new Error("마케팅에게 04가 보이면 안 됨");
    if (!mktRootNames.includes("05_마케팅자료")) throw new Error("마케팅에게 05가 안 보임");
    if (!mktRootNames.includes("01_회사공통")) throw new Error("01 누락");

    console.log("\nDB scenarios passed.");
  } finally {
    await prisma.driveFile.deleteMany({ where: { id: { in: [tempCs.id, tempMkt.id] } } });
    console.log("temp folders cleaned");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
