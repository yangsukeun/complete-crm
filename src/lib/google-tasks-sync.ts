import prisma from "@/lib/prisma";
import { getValidGoogleAccessToken, hasGoogleTasksScope } from "@/lib/google-oauth";
import {
  crmDueUnchanged,
  planGoogleTaskChange,
  type GoogleTaskItem,
} from "@/lib/google-tasks-map";

const TASKS_LIST = "@default";
const TASKS_PAGE_SIZE = 100;

type TasksListResponse = {
  items?: GoogleTaskItem[];
  nextPageToken?: string;
};

export type GoogleTasksSyncResult = {
  ok: true;
  created: number;
  updated: number;
  skipped: number;
  lastSyncedAt: string;
};

export class GoogleTasksAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleTasksAuthError";
  }
}

async function listGoogleTasks(
  accessToken: string,
  updatedMin: Date | null
): Promise<GoogleTaskItem[]> {
  const items: GoogleTaskItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      maxResults: String(TASKS_PAGE_SIZE),
      showCompleted: "true",
      showHidden: "true",
      showDeleted: "true",
    });
    if (updatedMin) params.set("updatedMin", updatedMin.toISOString());
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(TASKS_LIST)}/tasks?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.status === 401 || res.status === 403) {
      throw new GoogleTasksAuthError("구글 Tasks 권한이 없습니다. 캘린더 연동에서 다시 연결해 주세요.");
    }
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("[google-tasks] list failed", res.status, err.slice(0, 400));
      throw new Error("구글 할일을 가져오지 못했습니다.");
    }
    const data = (await res.json()) as TasksListResponse;
    if (data.items?.length) items.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

export async function markGoogleTaskCompleted(opts: {
  userId: string;
  googleTaskId: string;
}): Promise<void> {
  const accessToken = await getValidGoogleAccessToken(opts.userId);
  if (!accessToken) return;
  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(TASKS_LIST)}/tasks/${encodeURIComponent(opts.googleTaskId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "completed" }),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("[google-tasks] complete patch failed", res.status, err.slice(0, 300));
  }
}

const syncLocks = new Set<string>();

export async function syncGoogleTasksToCrm(opts: {
  userId: string;
  force?: boolean;
}): Promise<GoogleTasksSyncResult> {
  const { userId, force } = opts;
  const integration = await prisma.googleCalendarIntegration.findUnique({
    where: { userId },
  });
  if (!integration) {
    throw new GoogleTasksAuthError("Google 연동이 없습니다.");
  }
  if (!hasGoogleTasksScope(integration.oauthScopes)) {
    throw new GoogleTasksAuthError("구글 할일 권한이 없습니다. 다시 연결해 주세요.");
  }
  if (!force && integration.googleTasksSyncedAt) {
    const elapsed = Date.now() - integration.googleTasksSyncedAt.getTime();
    if (elapsed < 10 * 60 * 1000) {
      return {
        ok: true,
        created: 0,
        updated: 0,
        skipped: 0,
        lastSyncedAt: integration.googleTasksSyncedAt.toISOString(),
      };
    }
  }
  if (syncLocks.has(userId)) {
    return {
      ok: true,
      created: 0,
      updated: 0,
      skipped: 0,
      lastSyncedAt: (integration.googleTasksSyncedAt ?? new Date()).toISOString(),
    };
  }
  syncLocks.add(userId);
  try {
    const accessToken = await getValidGoogleAccessToken(userId);
    if (!accessToken) {
      throw new GoogleTasksAuthError("Google 토큰을 갱신하지 못했습니다. 다시 연결해 주세요.");
    }

    const updatedMin = force ? null : integration.googleTasksSyncedAt;
    const googleItems = await listGoogleTasks(accessToken, updatedMin);
    const ids = googleItems.map((g) => g.id).filter((id): id is string => Boolean(id?.trim()));
    const existingRows =
      ids.length === 0
        ? []
        : await prisma.task.findMany({
            where: { googleTaskId: { in: ids } },
            select: {
              id: true,
              googleTaskId: true,
              title: true,
              description: true,
              dueDate: true,
              isCompleted: true,
              projectId: true,
            },
          });
    const byGoogleId = new Map(existingRows.map((r) => [r.googleTaskId as string, r]));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const g of googleItems) {
      const existing = g.id ? byGoogleId.get(g.id) ?? null : null;
      const plan = planGoogleTaskChange(
        g,
        existing
          ? {
              title: existing.title,
              description: existing.description,
              dueDate: existing.dueDate,
              isCompleted: existing.isCompleted,
              projectId: existing.projectId,
            }
          : null
      );
      if (plan.action === "skip") {
        skipped += 1;
        continue;
      }
      if (plan.action === "create") {
        try {
          await prisma.task.create({
            data: {
              title: plan.title,
              description: plan.description,
              dueDate: plan.dueDate,
              isCompleted: plan.isCompleted,
              status: plan.isCompleted ? "DONE" : "TODO",
              completedAt: plan.isCompleted ? new Date() : null,
              googleTaskId: plan.googleTaskId,
              syncedFromGoogle: true,
              creationSource: "GOOGLE",
              assignedToId: userId,
              createdById: userId,
              projectId: null,
              scope: "TEAM",
              assignees: { create: { userId } },
            },
          });
          created += 1;
        } catch (e) {
          const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
          if (code === "P2002") {
            skipped += 1;
            continue;
          }
          throw e;
        }
        continue;
      }

      const titleChanged = existing && existing.title !== plan.title;
      const dueChanged = existing && !crmDueUnchanged(existing.dueDate, plan.dueDate);
      // 메모(description)는 신규 생성 시에만 가져오고, 이후 CRM에서 수정한 본문은 보존
      if (!titleChanged && !dueChanged && !plan.completeCrm) {
        skipped += 1;
        continue;
      }
      await prisma.task.update({
        where: { id: existing!.id },
        data: {
          title: plan.title,
          dueDate: plan.dueDate,
          ...(plan.completeCrm
            ? { isCompleted: true, status: "DONE" as const, completedAt: new Date() }
            : {}),
        },
      });
      updated += 1;
    }

    const now = new Date();
    await prisma.googleCalendarIntegration.update({
      where: { userId },
      data: { googleTasksSyncedAt: now },
    });
    return {
      ok: true,
      created,
      updated,
      skipped,
      lastSyncedAt: now.toISOString(),
    };
  } finally {
    syncLocks.delete(userId);
  }
}
