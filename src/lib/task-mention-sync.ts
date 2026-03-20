import { Prisma } from "@prisma/client";
import prisma from "./prisma";

/**
 * TaskMention 테이블이 DB에 없으면(P2021) 매 PATCH마다 deleteMany가 실패하며
 * Prisma가 stderr에 prisma:error를 계속 찍는다. 한 번 감지 후 호출을 생략한다.
 * (알림 Notification은 다른 테이블이므로 멘션 알림과 무관)
 */
let taskMentionTableAbsent = false;
let taskMentionMissingLogged = false;

/** 테스트·마이그레이션 적용 후 프로세스 재시작 없이 캐시 초기화할 때만 사용 */
export function resetTaskMentionSyncCache(): void {
  taskMentionTableAbsent = false;
  taskMentionMissingLogged = false;
}

/**
 * 업무 본문 멘션 사용자 목록을 TaskMention에 반영 (테이블 없으면 no-op)
 */
export async function syncTaskMentionsForTask(taskId: string, userIds: string[]): Promise<void> {
  if (taskMentionTableAbsent) return;
  try {
    await prisma.taskMention.deleteMany({ where: { taskId } });
    const unique = [...new Set(userIds)];
    if (unique.length > 0) {
      await prisma.taskMention.createMany({
        data: unique.map((userId) => ({ taskId, userId })),
        skipDuplicates: true,
      });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
      taskMentionTableAbsent = true;
      if (!taskMentionMissingLogged) {
        taskMentionMissingLogged = true;
        console.warn(
          "[TaskMention] DB에 TaskMention 테이블이 없어 동기화를 건너뜁니다. " +
            "알림(Notification)은 TaskMention과 별도입니다. " +
            "스키마 반영: `npx prisma db push` 또는 `prisma/DB_TASK_MENTION.md` 참고."
        );
      }
      return;
    }
    console.error("[TaskMention] 동기화 실패:", e);
  }
}
