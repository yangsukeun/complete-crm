import { getStageOverview } from "@/lib/task-stages";
import { withStageViewer } from "@/lib/task-stages-http";

export const runtime = "nodejs";

/** GET /api/task-stages/overview?done=1 — 전체 진행 현황(done=1이면 모두 끝난 프로젝트 포함) */
export async function GET(req: Request) {
  const includeDone = new URL(req.url).searchParams.get("done") === "1";
  return withStageViewer("overview", async (viewer) => ({
    projects: await getStageOverview(viewer, includeDone),
  }));
}
