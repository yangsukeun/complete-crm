import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { Prisma, WorkspaceScope } from "@prisma/client";
import { MINDMAP_CANVAS_ALL } from "@/lib/mindmap-canvas-keys";

export const runtime = "nodejs";

function normalizeCanvasProjectId(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return MINDMAP_CANVAS_ALL;
  if (s.length > 128 || /[^a-zA-Z0-9_-]/.test(s)) return MINDMAP_CANVAS_ALL;
  return s;
}

/** 직전 저장본(previousPayload)을 현재 data 로 복구 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const scope = await getServerWorkspaceScopeFromRequest(req);
    const projectId = normalizeCanvasProjectId(
      typeof body.projectId === "string" ? body.projectId : undefined
    );

    const row = await prisma.userTaskMindmapState.findUnique({
      where: {
        userId_scope_projectId: { userId: session.user.id, scope: scope as WorkspaceScope, projectId },
      },
      select: { previousPayload: true, data: true },
    });
    if (!row?.previousPayload || typeof row.previousPayload !== "object" || Array.isArray(row.previousPayload)) {
      return NextResponse.json({ error: "되돌릴 저장본이 없습니다." }, { status: 400 });
    }

    await prisma.userTaskMindmapState.update({
      where: {
        userId_scope_projectId: { userId: session.user.id, scope: scope as WorkspaceScope, projectId },
      },
      data: {
        data: row.previousPayload as object,
        previousPayload: Prisma.DbNull,
        previousSavedAt: null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[mindmap/revert]", e);
    return NextResponse.json({ error: "되돌리기에 실패했습니다." }, { status: 500 });
  }
}
