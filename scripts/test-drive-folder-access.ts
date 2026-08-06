/**
 * 부서 접근 규칙 시나리오 (순수 함수)
 * npx tsx scripts/test-drive-folder-access.ts
 */
import {
  canAccessDriveChain,
  DRIVE_SECTION,
  type DriveAccessActor,
  type DriveNode,
} from "../src/lib/drive/folder-access-rules";

function node(id: string, name: string, parentId: string | null): DriveNode {
  return { id, name, parentId, isFolder: true };
}

const n01 = node("01", DRIVE_SECTION.COMPANY, null);
const n02 = node("02", DRIVE_SECTION.PROJECT, null);
const n03 = node("03", DRIVE_SECTION.DEPT, null);
const n04 = node("04", DRIVE_SECTION.SALES, null);
const n05 = node("05", DRIVE_SECTION.MARKETING, null);
const nCs = node("cs", "CS", "03");
const nMkt = node("mkt", "마케팅", "03");
const nLog = node("log", "물류", "03");
const nCsFile = node("csf", "문서.docx", "cs");

function actor(role: string, department: string): DriveAccessActor {
  return { userId: "u", role, department };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("OK:", msg);
}

const csStaff = actor("USER", "CS");
const mktStaff = actor("USER", "마케팅");
const logLead = actor("TEAM_LEAD", "물류");
const admin = actor("ADMIN", "");

assert(canAccessDriveChain(csStaff, [n01]), "CS → 01 허용");
assert(canAccessDriveChain(csStaff, [n02]), "CS → 02 허용");
assert(canAccessDriveChain(csStaff, [n03]), "CS → 03 진입 허용");
assert(canAccessDriveChain(csStaff, [nCs, n03]), "CS → 03/CS 허용");
assert(!canAccessDriveChain(csStaff, [nMkt, n03]), "CS → 03/마케팅 거부");
assert(!canAccessDriveChain(csStaff, [nLog, n03]), "CS → 03/물류 거부");
assert(canAccessDriveChain(csStaff, [nCsFile, nCs, n03]), "CS → 03/CS/파일 허용");
assert(!canAccessDriveChain(csStaff, [n04]), "CS → 04 거부(영업부서 없음)");
assert(!canAccessDriveChain(csStaff, [n05]), "CS → 05 거부");

assert(canAccessDriveChain(mktStaff, [n05]), "마케팅 → 05 허용");
assert(canAccessDriveChain(mktStaff, [nMkt, n03]), "마케팅 → 03/마케팅 허용");
assert(!canAccessDriveChain(mktStaff, [nCs, n03]), "마케팅 → 03/CS 거부");

assert(canAccessDriveChain(logLead, [nLog, n03]), "물류팀장 → 03/물류 허용");
assert(!canAccessDriveChain(logLead, [n05]), "물류팀장 → 05 거부");

assert(canAccessDriveChain(admin, [nCs, n03]), "ADMIN → 03/CS 허용");
assert(canAccessDriveChain(admin, [n04]), "ADMIN → 04 허용");
assert(canAccessDriveChain(admin, [n05]), "ADMIN → 05 허용");

console.log("\nAll folder-access scenarios passed.");
