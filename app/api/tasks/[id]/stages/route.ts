import { getCachedUsersMinimal } from "@/lib/cache/users-list";
import { withoutCsTeam } from "@/lib/project-assignee-filter";
import { getTaskStages, replaceTaskStages, StageError, type StageInput } from "@/lib/task-stages";
import { readJson, withStageViewer } from "@/lib/task-stages-http";

export const runtime = "nodejs";

/** GET /api/tasks/[id]/stages — 단계 목록(+ 수정 가능하면 담당자 후보 직원 목록) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withStageViewer("GET", async (viewer) => {
    const data = await getTaskStages(id, viewer);
    if (!data.canEdit) return { ...data, candidates: [] };
    const users = await getCachedUsersMinimal();
    // CS팀은 프로젝트 단계 담당 대상이 아니라 후보에서 뺀다(이미 지정된 사람은 이름 표시를 위해 남김)
    const assigned = new Set(data.stages.flatMap((s) => s.assignees.map((a) => a.userId)));
    return {
      ...data,
      candidates: withoutCsTeam(users, assigned).map((u) => ({
        id: u.id,
        name: u.name,
        position: u.position,
        department: u.department,
      })),
    };
  });
}

/** PUT /api/tasks/[id]/stages — 단계 구성 저장 { stages: [{ id?, name, assigneeIds }] } */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withStageViewer("PUT", async (viewer) => {
    const body = await readJson(req);
    if (!Array.isArray(body.stages)) throw new StageError(400, "단계 목록이 없습니다.");
    return replaceTaskStages(id, viewer, body.stages as StageInput[]);
  });
}
