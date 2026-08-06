import prisma from "@/lib/prisma";
import { normalizeDepartment } from "@/lib/work-log-access";
import {
  canAccessDriveChain,
  isDriveFullAccessRole,
  type DriveAccessActor,
  type DriveNode,
} from "@/lib/drive/folder-access-rules";

export type { DriveAccessActor };
export {
  canAccessDriveChain,
  isDriveFullAccessRole,
  DRIVE_SECTION,
  DEPT_FOLDER_ALLOWED_DEPARTMENTS,
  SALES_ALLOWED_DEPARTMENTS,
  MARKETING_SECTION_ALLOWED_DEPARTMENTS,
  allowedDeptsForDeptFolderName,
} from "@/lib/drive/folder-access-rules";

export async function loadDriveAccessActor(userId: string): Promise<DriveAccessActor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, department: true },
  });
  if (!user) return null;
  return {
    userId: user.id,
    role: String(user.role ?? ""),
    department: normalizeDepartment(user.department),
  };
}

/** file → … → 루트 순 조상 체인 (file 자신 포함). */
export async function loadDriveAncestorChain(fileId: string): Promise<DriveNode[]> {
  const chain: DriveNode[] = [];
  let currentId: string | null = fileId;
  let guard = 0;
  while (currentId && guard < 32) {
    guard += 1;
    const row: DriveNode | null = await prisma.driveFile.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true, isFolder: true },
    });
    if (!row) break;
    chain.push(row);
    currentId = row.parentId;
  }
  return chain;
}

export async function canAccessDriveFileId(
  actor: DriveAccessActor,
  fileId: string
): Promise<boolean> {
  if (isDriveFullAccessRole(actor.role)) return true;
  const chain = await loadDriveAncestorChain(fileId);
  if (chain.length === 0) return false;
  return canAccessDriveChain(actor, chain);
}

/** 목록 필터: 동일 parent 아래 여러 행 — 부모 체인 1회 + 각 자식 판정 */
export async function filterAccessibleDriveFiles<
  T extends { id: string; name: string; parentId: string | null; isFolder: boolean },
>(actor: DriveAccessActor, files: T[]): Promise<T[]> {
  if (isDriveFullAccessRole(actor.role)) return files;
  if (files.length === 0) return files;

  const parentId = files[0]?.parentId ?? null;
  const sameParent = files.every((f) => f.parentId === parentId);

  if (sameParent && parentId) {
    const parentChain = await loadDriveAncestorChain(parentId);
    if (!canAccessDriveChain(actor, parentChain)) return [];
    return files.filter((f) => canAccessDriveChain(actor, [f, ...parentChain]));
  }

  if (sameParent && parentId == null) {
    return files.filter((f) => canAccessDriveChain(actor, [f]));
  }

  const out: T[] = [];
  for (const f of files) {
    const chain = await loadDriveAncestorChain(f.id);
    if (canAccessDriveChain(actor, chain)) out.push(f);
  }
  return out;
}

export async function assertCanAccessDriveFileId(
  actor: DriveAccessActor,
  fileId: string
): Promise<{ ok: true } | { ok: false; status: 403; error: string }> {
  const ok = await canAccessDriveFileId(actor, fileId);
  if (!ok) {
    return { ok: false, status: 403, error: "이 폴더·파일에 접근할 권한이 없습니다." };
  }
  return { ok: true };
}
