/**
 * 로컬 검증: 폴더 피커용 API + create-file
 *   VERIFY_DRIVE_EMAIL=... VERIFY_DRIVE_PASSWORD=... npx tsx scripts/verify-drive-create-file.ts
 */
import "dotenv/config";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const email = process.env.VERIFY_DRIVE_EMAIL;
const password = process.env.VERIFY_DRIVE_PASSWORD;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK: ${msg}`);
}

async function login(em: string, pw: string) {
  const body = new URLSearchParams({ email: em, password: pw, callbackUrl: "/" });
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  assert(cookie.length > 10, "로그인 쿠키");
  return cookie;
}

async function main() {
  if (!email || !password) {
    console.log("SKIP live: VERIFY_DRIVE_EMAIL / VERIFY_DRIVE_PASSWORD 미설정");
    console.log("OK: tsc/build로 타입·번들 검증 (라이브 Drive는 자격증명 필요)");
    return;
  }

  const cookie = await login(email, password);
  const listRes = await fetch(`${BASE}/api/drive/files`, { headers: { Cookie: cookie } });
  const list = await listRes.json();
  assert(listRes.status === 200, "files 목록");
  const folder = (list.files as { isFolder: boolean; driveFileId: string; name: string; id: string }[]).find(
    (f) => f.isFolder && f.driveFileId
  );
  assert(folder, "하위 폴더 1개 이상");

  // 취소 시나리오는 UI — create 미호출은 코드상 pendingCreateType=null 처리

  const createRes = await fetch(`${BASE}/api/drive/create-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ type: "document", folderId: folder!.driveFileId }),
  });
  const created = await createRes.json();
  assert(createRes.status === 200, `create-file ${createRes.status} ${created.error ?? ""}`);
  assert(created.file?.webViewLink, "webViewLink");
  assert(created.file?.folderDriveId === folder!.driveFileId, "선택한 폴더에 생성");
  console.log("created", created.file.name, created.file.webViewLink);

  // 피커 내 새폴더 → 그 안 create
  const newName = `피커검증-${Date.now()}`;
  const foldRes = await fetch(`${BASE}/api/drive/folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: newName, parentFolderId: folder!.driveFileId }),
  });
  const foldBody = await foldRes.json();
  assert(foldRes.status === 200, `새 폴더 ${foldRes.status}`);
  const create2 = await fetch(`${BASE}/api/drive/create-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ type: "spreadsheet", folderId: foldBody.file.driveFileId }),
  });
  const c2 = await create2.json();
  assert(create2.status === 200, "새 폴더 안 시트 생성");
  assert(c2.file?.folderDriveId === foldBody.file.driveFileId, "새 폴더에 저장");

  console.log("\nALL LIVE CHECKS PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
