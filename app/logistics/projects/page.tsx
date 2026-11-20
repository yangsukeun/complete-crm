import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { workspacePageAreas } from "@/lib/workspace-page-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "3PL 담당 프로젝트", robots: { index: false, follow: false } };

const stageLabels = { PENDING: "대기", ACTIVE: "진행 중", DONE: "완료" } as const;

type LinkedEntry = {
  key: string;
  name: string;
  fullProjectId?: string;
  stages: { id: string; name: string; status: keyof typeof stageLabels; progress: number; completed: boolean; order: number }[];
};

export default async function LogisticsProjectsPage() {
  const session = await getAppSession();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  const viewer = await prisma.user.findUnique({
    where: { id },
    select: { id: true, department: true, accountDisabled: true },
  });
  if (!viewer || viewer.accountDisabled || !workspacePageAreas(viewer).includes("logistics")) {
    notFound();
  }

  const [memberships, assignments] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null, users: { some: { id: viewer.id } } },
      select: { id: true, name: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }),
    prisma.taskStageAssignee.findMany({
      where: {
        userId: viewer.id,
        stage: { task: {
          scope: "TEAM", deletedAt: null, archivedAt: null,
          OR: [{ projectId: null }, { project: { is: { deletedAt: null } } }],
        } },
      },
      select: {
        progress: true, completedAt: true,
        stage: { select: {
          id: true, name: true, status: true, orderIndex: true,
          task: { select: { id: true, title: true, project: { select: { id: true, name: true } } } },
        } },
      },
      orderBy: [{ stage: { taskId: "asc" } }, { stage: { orderIndex: "asc" } }],
    }),
  ]);

  const entries = new Map<string, LinkedEntry>();
  for (const project of memberships) {
    const key = `project:${project.id}`;
    entries.set(key, { key, name: project.name, fullProjectId: project.id, stages: [] });
  }
  for (const { stage, progress, completedAt } of assignments) {
    const { task } = stage;
    const key = task.project ? `project:${task.project.id}` : `task:${task.id}`;
    const entry: LinkedEntry = entries.get(key) ?? { key, name: task.project?.name ?? task.title, stages: [] };
    entry.stages.push({ id: stage.id, name: stage.name, status: stage.status, progress, completed: completedAt !== null, order: stage.orderIndex });
    entries.set(key, entry);
  }
  const projects = [...entries.values()];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:p-8">
      <Link href="/logistics" prefetch={false} className="inline-flex min-h-11 items-center text-sm font-semibold text-violet-800">
        ← 3PL 운영실
      </Link>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">3PL 담당 프로젝트</h1>
        <p className="text-sm text-muted-foreground">프로젝트에 참여자로 연결됐거나, 그 안에서 단계에 배정된 업무만 보입니다.</p>
      </header>
      {projects.length ? (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="연결된 프로젝트">
          {projects.map((entry) => (
            <li key={entry.key} className="rounded-xl border bg-card p-4">
              {entry.stages.length ? (
                <details>
                  <summary className="cursor-pointer py-2 font-semibold">{entry.name} · 내 담당 단계 {entry.stages.length}개</summary>
                  <ul className="mt-2 space-y-2 border-t pt-2 text-sm">
                    {[...entry.stages].sort((a, b) => a.order - b.order).map((stage) => (
                      <li key={stage.id} className="flex justify-between gap-3">
                        <span className="min-w-0 break-words">{stage.name}</span>
                        <span className="shrink-0 text-muted-foreground">{stage.completed ? "완료" : `${stageLabels[stage.status]} · ${stage.progress}%`}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : <p className="py-2 font-semibold">{entry.name}</p>}
              {entry.fullProjectId && (
                <Link href={`/projects/${encodeURIComponent(entry.fullProjectId)}`} prefetch={false}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-violet-800">프로젝트 열기 →</Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">연결된 프로젝트가 아직 없습니다.</p>
      )}
    </main>
  );
}
