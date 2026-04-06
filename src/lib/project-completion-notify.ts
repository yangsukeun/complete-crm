import prisma from "@/lib/prisma";
import { createNotificationWithOptions } from "@/lib/notifications";
import { parseMentionUserIdsJson } from "@/lib/mention-user-ids-json";

/** 견적 상태 COMPLETED 등으로 프로젝트가 완료됐을 때 팀·멘션·처리자에게 알림 */
export async function notifyProjectCompletedStakeholders(params: {
  projectId: string;
  actorUserId: string;
}): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: params.projectId, deletedAt: null },
    select: {
      id: true,
      name: true,
      users: { select: { id: true } },
      mentionedUserIds: true,
    },
  });
  if (!project) return;

  const recipients = new Set<string>();
  for (const u of project.users) recipients.add(u.id);
  for (const uid of parseMentionUserIdsJson(project.mentionedUserIds)) recipients.add(uid);
  recipients.add(params.actorUserId);

  const label = project.name.trim() || "프로젝트";
  const msg = `"${label}" 프로젝트가 완료 처리되었습니다.`;

  await Promise.all(
    [...recipients].map((userId) =>
      createNotificationWithOptions({
        userId,
        type: "PROJECT_COMPLETED",
        message: msg,
        link: `/projects/${project.id}`,
        actorId: params.actorUserId,
        priority: "medium",
      })
    )
  );
}
