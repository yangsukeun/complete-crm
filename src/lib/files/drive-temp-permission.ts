import { addHours } from "date-fns";
import prisma from "@/lib/prisma";
import { getDriveV3 } from "@/lib/google-drive-admin";

type GDrive = ReturnType<typeof getDriveV3>;

/** 만료된 Drive `anyone` 미리보기 권한 제거 + DB 행 삭제 */
export async function revokeExpiredDrivePreviewPermissions(drive: GDrive, now = new Date()): Promise<number> {
  const rows = await prisma.drivePreviewPermissionExpiry.findMany({
    where: { expiresAt: { lte: now } },
  });
  let n = 0;
  for (const r of rows) {
    try {
      await drive.permissions.delete({
        fileId: r.driveFileId,
        permissionId: r.permissionId,
        supportsAllDrives: true,
      });
    } catch {
      /* 이미 삭제됨 등 */
    }
    await prisma.drivePreviewPermissionExpiry.delete({ where: { id: r.id } }).catch(() => {});
    n++;
  }
  return n;
}

/**
 * Drive 문서 `/preview` iframe용 `anyone:reader` (1시간) — 만료 후 Cron/다음 요청에서 회수.
 */
export async function ensureTemporaryAnyoneReaderForPreview(drive: GDrive, driveFileId: string): Promise<void> {
  await revokeExpiredDrivePreviewPermissions(drive, new Date());

  const active = await prisma.drivePreviewPermissionExpiry.findFirst({
    where: { driveFileId, expiresAt: { gt: new Date() } },
  });
  if (active) return;

  const stale = await prisma.drivePreviewPermissionExpiry.findMany({ where: { driveFileId } });
  for (const r of stale) {
    try {
      await drive.permissions.delete({
        fileId: r.driveFileId,
        permissionId: r.permissionId,
        supportsAllDrives: true,
      });
    } catch {
      /* */
    }
    await prisma.drivePreviewPermissionExpiry.delete({ where: { id: r.id } }).catch(() => {});
  }

  const perm = await drive.permissions.create({
    fileId: driveFileId,
    requestBody: { role: "reader", type: "anyone" },
    supportsAllDrives: true,
  });
  const permissionId = perm.data.id;
  if (!permissionId) throw new Error("Drive permission id missing");

  await prisma.drivePreviewPermissionExpiry.create({
    data: {
      driveFileId,
      permissionId,
      expiresAt: addHours(new Date(), 1),
    },
  });
}
