import { setMyStageCompleted } from "@/lib/task-stages";
import { readJson, withStageViewer } from "@/lib/task-stages-http";

export const runtime = "nodejs";

/** POST /api/task-stages/[stageId]/complete — 내 담당분 완료 { undo?: true 면 완료 취소 } */
export async function POST(req: Request, { params }: { params: Promise<{ stageId: string }> }) {
  const { stageId } = await params;
  return withStageViewer("complete", async (viewer) => {
    const body = await readJson(req);
    return setMyStageCompleted(stageId, viewer, body.undo !== true);
  });
}
