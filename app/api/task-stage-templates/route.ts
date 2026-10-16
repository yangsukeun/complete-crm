import { deleteStageTemplate, listStageTemplates, saveStageTemplate, StageError } from "@/lib/task-stages";
import { readJson, withStageViewer } from "@/lib/task-stages-http";

export const runtime = "nodejs";

/** GET /api/task-stage-templates — 단계 템플릿 목록 */
export async function GET() {
  return withStageViewer("templates GET", async () => ({ templates: await listStageTemplates() }));
}

/** POST /api/task-stage-templates — { name, stageNames } 저장(같은 이름이면 덮어씀) */
export async function POST(req: Request) {
  return withStageViewer("templates POST", async (viewer) => {
    const body = await readJson(req);
    await saveStageTemplate(viewer, body.name, body.stageNames);
    return { templates: await listStageTemplates() };
  });
}

/** DELETE /api/task-stage-templates?id= */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  return withStageViewer("templates DELETE", async (viewer) => {
    if (!id) throw new StageError(400, "삭제할 템플릿이 없습니다.");
    await deleteStageTemplate(viewer, id);
    return { templates: await listStageTemplates() };
  });
}
