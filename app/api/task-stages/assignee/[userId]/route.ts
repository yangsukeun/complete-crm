import { getAssigneeStages } from "@/lib/task-stages";
import { withStageViewer } from "@/lib/task-stages-http";

export const runtime = "nodejs";

/** GET /api/task-stages/assignee/[userId] — 담당자 페이지 데이터(userId=me 면 본인) */
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return withStageViewer("assignee", async (viewer) =>
    getAssigneeStages(userId === "me" ? viewer.id : userId, viewer)
  );
}
