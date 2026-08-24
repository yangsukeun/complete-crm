import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { isDriveAdminRole } from "@/lib/drive/folder-trash-policy";

export const runtime = "nodejs";

function requireAdmin(role: string | undefined) {
  return isDriveAdminRole(role);
}

/** GET /api/drive/team-share — 규칙 목록 */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!requireAdmin(session.user.role)) {
      return NextResponse.json({ error: "대표/관리자만 접근할 수 있습니다." }, { status: 403 });
    }

    const rows = await prisma.driveTeamShare.findMany({
      orderBy: [{ googleFolderId: "asc" }, { createdAt: "asc" }],
      include: {
        user: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      rules: rows.map((r) => ({
        id: r.id,
        googleFolderId: r.googleFolderId,
        folderName: r.folderName,
        targetType: r.targetType,
        department: r.department,
        userId: r.userId,
        userName: r.user?.name ?? null,
        userEmail: r.user?.email ?? null,
        role: r.role,
        createdBy: r.createdBy,
        creatorName: r.creator.name,
        createdAt: r.createdAt.toISOString(),
        lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
        lastSyncSummary: r.lastSyncSummary,
        lastSyncErrors: r.lastSyncErrors,
        needsResync: r.needsResync,
      })),
    });
  } catch (e) {
    console.error("[drive/team-share GET]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

const createSchema = z.object({
  googleFolderId: z.string().min(5),
  folderName: z.string().min(1).max(300),
  targetType: z.enum(["DEPARTMENT", "USER"]),
  department: z.string().optional(),
  userId: z.string().optional(),
  role: z.enum(["READER", "WRITER"]).default("READER"),
});

/** POST /api/drive/team-share — 규칙 추가 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!requireAdmin(session.user.role)) {
      return NextResponse.json({ error: "대표/관리자만 등록할 수 있습니다." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "입력값이 올바르지 않습니다." }, { status: 400 });
    }
    const data = parsed.data;

    if (data.targetType === "DEPARTMENT") {
      if (!data.department?.trim()) {
        return NextResponse.json({ error: "부서명을 입력하세요." }, { status: 400 });
      }
    } else if (!data.userId) {
      return NextResponse.json({ error: "사용자를 선택하세요." }, { status: 400 });
    }

    if (data.targetType === "USER" && data.userId) {
      const u = await prisma.user.findUnique({ where: { id: data.userId }, select: { id: true } });
      if (!u) return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    const created = await prisma.driveTeamShare.create({
      data: {
        googleFolderId: data.googleFolderId.trim(),
        folderName: data.folderName.trim(),
        targetType: data.targetType,
        department: data.targetType === "DEPARTMENT" ? data.department!.trim() : null,
        userId: data.targetType === "USER" ? data.userId! : null,
        role: data.role,
        createdBy: session.user.id,
        needsResync: true,
      },
    });

    return NextResponse.json({ ok: true, rule: created });
  } catch (e) {
    console.error("[drive/team-share POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
