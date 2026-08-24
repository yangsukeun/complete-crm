import { getDriveV3 } from "@/lib/google-drive-admin";

/**
 * 탐색기 열람 JIT: 공유드라이브 파일에 사용자 reader 권한 부여.
 * 이미 있으면(중복) 무시.
 */
export async function ensureDriveUserReaderPermission(
  driveFileId: string,
  emailAddress: string
): Promise<{ granted: boolean; alreadyHad: boolean }> {
  const email = emailAddress.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("유효한 이메일이 필요합니다.");
  }

  const drive = getDriveV3();
  try {
    await drive.permissions.create({
      fileId: driveFileId,
      requestBody: {
        type: "user",
        role: "reader",
        emailAddress: email,
      },
      sendNotificationEmail: false,
      supportsAllDrives: true,
      fields: "id",
    });
    return { granted: true, alreadyHad: false };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const reasons: string[] = [];
    if (e && typeof e === "object" && "errors" in e && Array.isArray((e as { errors: unknown }).errors)) {
      for (const er of (e as { errors: { reason?: string }[] }).errors) {
        if (er?.reason) reasons.push(er.reason);
      }
    }
    const dataErrors = (
      e as { response?: { data?: { error?: { errors?: { reason?: string }[] } } } }
    )?.response?.data?.error?.errors;
    if (Array.isArray(dataErrors)) {
      for (const er of dataErrors) {
        if (er?.reason) reasons.push(er.reason);
      }
    }
    if (
      reasons.some((r) => /alreadyExists|duplicate/i.test(r)) ||
      /already exists|duplicate|Permission already|existing permission|alreadyHas/i.test(msg)
    ) {
      return { granted: false, alreadyHad: true };
    }
    throw e;
  }
}
