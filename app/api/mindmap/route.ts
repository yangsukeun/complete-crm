import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { WorkspaceScope } from "@prisma/client";

const MAX_BODY_BYTES = 512_000;

type MindmapPayload = {
  positions?: Record<string, { x: number; y: number }>;
  stagedRootIds?: string[];
  collapsedIds?: string[];
  nodeStylesMap?: Record<string, unknown>;
  canvasBgColor?: string;
};

function sanitizePayload(raw: unknown): MindmapPayload {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const o = raw as Record<string, unknown>;
  const out: MindmapPayload = {};

  if (o.positions && typeof o.positions === "object" && !Array.isArray(o.positions)) {
    const pos: Record<string, { x: number; y: number }> = {};
    for (const [id, v] of Object.entries(o.positions)) {
      if (typeof id !== "string" || id.length > 128) continue;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const vx = (v as { x?: unknown }).x;
        const vy = (v as { y?: unknown }).y;
        if (typeof vx === "number" && Number.isFinite(vx) && typeof vy === "number" && Number.isFinite(vy)) {
          pos[id] = { x: vx, y: vy };
        }
      }
    }
    if (Object.keys(pos).length > 0) out.positions = pos;
  }

  if (Array.isArray(o.stagedRootIds)) {
    out.stagedRootIds = o.stagedRootIds.filter((id): id is string => typeof id === "string" && id.length <= 128).slice(0, 500);
  }

  if (Array.isArray(o.collapsedIds)) {
    out.collapsedIds = o.collapsedIds.filter((id): id is string => typeof id === "string" && id.length <= 128).slice(0, 500);
  }

  if (o.nodeStylesMap && typeof o.nodeStylesMap === "object" && !Array.isArray(o.nodeStylesMap)) {
    const styles: Record<string, unknown> = {};
    let n = 0;
    for (const [id, v] of Object.entries(o.nodeStylesMap)) {
      if (n >= 500) break;
      if (id.length > 128) continue;
      if (v && typeof v === "object" && !Array.isArray(v)) styles[id] = v;
      n++;
    }
    if (Object.keys(styles).length > 0) out.nodeStylesMap = styles;
  }

  if (typeof o.canvasBgColor === "string" && o.canvasBgColor.length <= 64 && /^#[0-9a-fA-F]{3,8}$/.test(o.canvasBgColor.trim())) {
    out.canvasBgColor = o.canvasBgColor.trim();
  }

  return out;
}

/** POST 시 sanitize 결과에서 키가 빠지면 “미전달”으로 보고, DB 기존값과 병합한다 */
function mergeMindmapPayloads(prev: MindmapPayload, inc: MindmapPayload): Record<string, unknown> {
  const positions =
    inc.positions !== undefined && Object.keys(inc.positions).length > 0
      ? inc.positions
      : prev.positions ?? {};
  return {
    positions: positions && Object.keys(positions).length > 0 ? positions : {},
    stagedRootIds: inc.stagedRootIds !== undefined ? inc.stagedRootIds : prev.stagedRootIds ?? [],
    collapsedIds: inc.collapsedIds !== undefined ? inc.collapsedIds : prev.collapsedIds ?? [],
    nodeStylesMap: inc.nodeStylesMap !== undefined ? inc.nodeStylesMap : prev.nodeStylesMap ?? {},
    canvasBgColor: inc.canvasBgColor !== undefined ? inc.canvasBgColor : prev.canvasBgColor ?? "#f9fafb",
  };
}

/** GET: 현재 세션 · 워크스페이스 스코프 기준 마인드맵 UI 상태 */
export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scope = await getServerWorkspaceScopeFromRequest(req);
    const row = await prisma.userTaskMindmapState.findUnique({
      where: {
        userId_scope: { userId: session.user.id, scope },
      },
    });

    const data = (row?.data && typeof row.data === "object" && !Array.isArray(row.data)
      ? row.data
      : {}) as Record<string, unknown>;

    const payload = sanitizePayload(data);
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[mindmap GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST: 전체 상태 upsert (nodes/edges는 Task 기반이라 positions·staging 등만 저장) */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawText = await req.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const scope = await getServerWorkspaceScopeFromRequest(req);
    const incoming = sanitizePayload(body);

    const existing = await prisma.userTaskMindmapState.findUnique({
      where: {
        userId_scope: { userId: session.user.id, scope },
      },
    });
    const prev = sanitizePayload(existing?.data ?? {});
    const merged = mergeMindmapPayloads(prev, incoming);

    await prisma.userTaskMindmapState.upsert({
      where: {
        userId_scope: { userId: session.user.id, scope },
      },
      create: {
        userId: session.user.id,
        scope: scope as WorkspaceScope,
        data: merged as object,
      },
      update: {
        data: merged as object,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[mindmap POST]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
