import "server-only";

import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { StageError, type StageViewer } from "@/lib/task-stages";

/** 단계 API 공통: 로그인 확인 + StageError → 상태 코드 변환 */
export async function withStageViewer(
  label: string,
  handler: (viewer: StageViewer) => Promise<unknown>
): Promise<NextResponse> {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const viewer: StageViewer = {
      id: session.user.id,
      role: (session.user as { role?: string }).role ?? null,
    };
    const result = await handler(viewer);
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    if (e instanceof StageError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error(`[task-stages] ${label}`, e);
    return NextResponse.json({ error: "단계 정보를 처리하지 못했습니다." }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    throw new StageError(400, "요청 형식이 올바르지 않습니다.");
  }
}
