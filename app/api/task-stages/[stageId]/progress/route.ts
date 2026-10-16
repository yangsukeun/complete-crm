import { getStageProgressLogs, saveMyStageProgress } from "@/lib/task-stages";
import { readJson, withStageViewer } from "@/lib/task-stages-http";

export const runtime = "nodejs";

/** GET /api/task-stages/[stageId]/progress — 진행 기록(최근순) */
export async function GET(_req: Request, { params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  return withStageViewer("progress GET", async (viewer) => ({ logs: await getStageProgressLogs(stageId, viewer) }));
}

/** POST /api/task-stages/[stageId]/progress — 저장 버튼 { note, progress } */
export async function POST(req: Request, { params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  return withStageViewer("progress POST", async (viewer) => {
    const body = await readJson(req);
    await saveMyStageProgress(stageId, viewer, body.note, body.progress);
    return { ok: true };
  });
}
