import "server-only";

import prisma from "@/lib/prisma";
import { getDriveV3, getOrCreateDriveJwtAuth } from "@/lib/google-drive-admin";
import { normalizeDepartment } from "@/lib/work-log-access";
import type { DriveTeamShare, DriveTeamShareRole } from "@prisma/client";

export type SyncFailure = { email: string; reason: string };

export type FolderSyncResult = {
  googleFolderId: string;
  folderName: string;
  desiredCount: number;
  added: number;
  removed: number;
  skippedProtected: number;
  failures: SyncFailure[];
  summary: string;
};

type ListedPerm = {
  id: string;
  email: string;
  role: string;
  type: string;
};

function serviceAccountEmail(): string | null {
  try {
    const auth = getOrCreateDriveJwtAuth();
    return (auth as { email?: string }).email?.trim().toLowerCase() ?? null;
  } catch {
    return null;
  }
}

/** 회수 금지 이메일 (소문자) */
export async function loadProtectedEmails(): Promise<Set<string>> {
  const set = new Set<string>();
  const sa = serviceAccountEmail();
  if (sa) set.add(sa);

  const envExtra = process.env.DRIVE_SHARE_PROTECT_EMAILS?.trim();
  if (envExtra) {
    for (const part of envExtra.split(/[,;\s]+/)) {
      const e = part.trim().toLowerCase();
      if (e.includes("@")) set.add(e);
    }
  }

  const admins = await prisma.user.findMany({
    where: {
      role: { in: ["ADMIN", "EXECUTIVE"] },
      accountDisabled: false,
    },
    select: { email: true },
  });
  for (const u of admins) {
    if (u.email) set.add(u.email.trim().toLowerCase());
  }
  return set;
}

function roleRank(role: DriveTeamShareRole | "reader" | "writer" | string): number {
  const r = String(role).toLowerCase();
  if (r === "writer" || r === "fileorganizer" || r === "organizer" || r === "owner") return 2;
  return 1;
}

function toDriveRole(role: DriveTeamShareRole): "reader" | "writer" {
  return role === "WRITER" ? "writer" : "reader";
}

/** 규칙 → 이메일별 최종 role (writer 우선) */
export async function resolveDesiredEmailRoles(
  rules: DriveTeamShare[]
): Promise<Map<string, "reader" | "writer">> {
  const desired = new Map<string, "reader" | "writer">();

  const deptNames = [
    ...new Set(
      rules
        .filter((r) => r.targetType === "DEPARTMENT" && r.department)
        .map((r) => normalizeDepartment(r.department))
    ),
  ].filter(Boolean);

  const usersByDept =
    deptNames.length > 0
      ? await prisma.user.findMany({
          where: {
            accountDisabled: false,
            OR: deptNames.map((d) => ({
              department: { equals: d, mode: "insensitive" as const },
            })),
          },
          select: { email: true, department: true },
        })
      : [];

  for (const rule of rules) {
    const driveRole = toDriveRole(rule.role);
    if (rule.targetType === "DEPARTMENT" && rule.department) {
      const dept = normalizeDepartment(rule.department);
      for (const u of usersByDept) {
        if (normalizeDepartment(u.department) !== dept) continue;
        const email = u.email?.trim().toLowerCase();
        if (!email) continue;
        const prev = desired.get(email);
        if (!prev || roleRank(driveRole) > roleRank(prev)) {
          desired.set(email, driveRole);
        }
      }
    } else if (rule.targetType === "USER" && rule.userId) {
      const u = await prisma.user.findUnique({
        where: { id: rule.userId },
        select: { email: true, accountDisabled: true },
      });
      if (!u || u.accountDisabled || !u.email) continue;
      const email = u.email.trim().toLowerCase();
      const prev = desired.get(email);
      if (!prev || roleRank(driveRole) > roleRank(prev)) {
        desired.set(email, driveRole);
      }
    }
  }

  return desired;
}

async function listUserPermissions(googleFolderId: string): Promise<ListedPerm[]> {
  const drive = getDriveV3();
  const out: ListedPerm[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.permissions.list({
      fileId: googleFolderId,
      supportsAllDrives: true,
      fields: "nextPageToken, permissions(id,emailAddress,role,type)",
      pageSize: 100,
      pageToken,
    });
    for (const p of res.data.permissions ?? []) {
      if (p.type !== "user" || !p.emailAddress || !p.id) continue;
      out.push({
        id: p.id,
        email: p.emailAddress.trim().toLowerCase(),
        role: String(p.role ?? "reader"),
        type: String(p.type),
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/**
 * 한 폴더의 DriveTeamShare 규칙들을 Google permissions와 동기화.
 */
export async function syncFolderTeamShares(googleFolderId: string): Promise<FolderSyncResult> {
  const rules = await prisma.driveTeamShare.findMany({
    where: { googleFolderId },
  });
  const folderName = rules[0]?.folderName ?? googleFolderId;
  const protectedEmails = await loadProtectedEmails();
  const desired = await resolveDesiredEmailRoles(rules);
  const existing = await listUserPermissions(googleFolderId);
  const existingByEmail = new Map(existing.map((p) => [p.email, p]));

  const drive = getDriveV3();
  let added = 0;
  let removed = 0;
  let skippedProtected = 0;
  const failures: SyncFailure[] = [];

  // 추가·업그레이드
  for (const [email, role] of desired) {
    const cur = existingByEmail.get(email);
    if (cur && roleRank(cur.role) >= roleRank(role)) continue;
    try {
      if (cur && roleRank(role) > roleRank(cur.role)) {
        // writer로 올리기: 기존 삭제 후 재부여가 안전
        await drive.permissions.delete({
          fileId: googleFolderId,
          permissionId: cur.id,
          supportsAllDrives: true,
        });
      }
      await drive.permissions.create({
        fileId: googleFolderId,
        requestBody: {
          type: "user",
          role,
          emailAddress: email,
        },
        sendNotificationEmail: false,
        supportsAllDrives: true,
        fields: "id",
      });
      added += 1;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      failures.push({
        email,
        reason: /not a valid|invalid|does not exist|cannot find|naver/i.test(reason)
          ? `권한 부여 실패: ${reason.slice(0, 180)}`
          : reason.slice(0, 240),
      });
    }
  }

  // 회수: CRM이 관리하는 대상만 — desired에 없고, 보호 목록·owner/organizer 제외
  for (const perm of existing) {
    if (desired.has(perm.email)) continue;
    if (protectedEmails.has(perm.email)) {
      skippedProtected += 1;
      continue;
    }
    const r = perm.role.toLowerCase();
    if (r === "owner" || r === "organizer") {
      skippedProtected += 1;
      continue;
    }
    // reader/writer만 회수 (fileOrganizer 등도 보호)
    if (r !== "reader" && r !== "writer" && r !== "commenter") {
      skippedProtected += 1;
      continue;
    }
    try {
      await drive.permissions.delete({
        fileId: googleFolderId,
        permissionId: perm.id,
        supportsAllDrives: true,
      });
      removed += 1;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      failures.push({ email: perm.email, reason: `회수 실패: ${reason.slice(0, 180)}` });
    }
  }

  const summary = `추가 ${added}명 / 회수 ${removed}명` + (failures.length ? ` / 실패 ${failures.length}` : "");
  const now = new Date();
  await prisma.driveTeamShare.updateMany({
    where: { googleFolderId },
    data: {
      lastSyncedAt: now,
      lastSyncSummary: summary,
      lastSyncErrors: failures.length > 0 ? (failures as object) : undefined,
      needsResync: false,
    },
  });
  // Prisma Json null clear
  if (failures.length === 0) {
    await prisma.driveTeamShare.updateMany({
      where: { googleFolderId },
      data: { lastSyncErrors: [] as object },
    });
  }

  return {
    googleFolderId,
    folderName,
    desiredCount: desired.size,
    added,
    removed,
    skippedProtected,
    failures,
    summary,
  };
}

/** 부서/계정 변경 시 관련 규칙에 재동기화 필요 표시 */
export async function markTeamSharesNeedsResync(opts: {
  department?: string | null;
  userId?: string | null;
}): Promise<number> {
  const or: { department?: string; userId?: string }[] = [];
  if (opts.department?.trim()) {
    or.push({ department: opts.department.trim() });
  }
  if (opts.userId) {
    or.push({ userId: opts.userId });
  }
  if (or.length === 0) return 0;
  const res = await prisma.driveTeamShare.updateMany({
    where: { OR: or },
    data: { needsResync: true },
  });
  return res.count;
}
