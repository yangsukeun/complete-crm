import { format } from "date-fns";
import prisma from "@/lib/prisma";

export type ActivityActionType = "TASK_CREATED" | "TASK_COMPLETED" | "COMMENT_ADDED" | "LOGIN" | "CHECK_IN" | "CHECK_OUT";

/**
 * 활동 로그 1건 기록 (업무 생성/완료/댓글/로그인/출퇴근)
 * @param ipAddress 출퇴근 시 IP (업무일지에 수정 불가로 표시)
 */
export async function createActivityLog(
  userId: string,
  actionType: ActivityActionType,
  targetTitle: string,
  ipAddress?: string | null
): Promise<void> {
  if (!(prisma as { activityLog?: unknown }).activityLog) return;
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        actionType,
        targetTitle: targetTitle || "(제목 없음)",
        ...(ipAddress != null && ipAddress !== "" ? { ipAddress } : {}),
      },
    });
  } catch (e) {
    console.error("[ActivityLog] 기록 실패:", e);
  }
}

/**
 * 해당 날짜(YYYY-MM-DD)의 ActivityLog를 시간순으로 가져와
 * " - [14:00] '메인 디자인' 업무 완료" 형식의 마크다운으로 변환
 */
export type ActivityForDisplay = {
  actionType: string;
  targetTitle: string;
  timestamp: Date;
  ipAddress?: string | null;
};

function formatActivitiesAsMarkdown(
  activities: ActivityForDisplay[]
): string {
  const lines = activities.map((a) => {
    const time = format(new Date(a.timestamp), "HH:mm");
    const label =
      a.actionType === "TASK_CREATED"
        ? "업무 생성"
        : a.actionType === "TASK_COMPLETED"
          ? "업무 완료"
          : a.actionType === "COMMENT_ADDED"
            ? "댓글 작성"
            : a.actionType === "LOGIN"
              ? "로그인"
              : a.actionType === "CHECK_IN"
                ? "출근"
                : a.actionType === "CHECK_OUT"
                  ? "퇴근"
                  : "활동";
    const ipSuffix =
      (a.actionType === "CHECK_IN" || a.actionType === "CHECK_OUT") && a.ipAddress
        ? ` (IP: ${a.ipAddress})`
        : "";
    return ` - [${time}] '${(a.targetTitle || "").replace(/'/g, "''")}' ${label}${ipSuffix}`;
  });
  return lines.length ? `# 업무일지\n\n${lines.join("\n")}` : "# 업무일지\n\n(기록된 활동이 없습니다.)";
}

/**
 * 해당 사용자·날짜의 활동 로그 조회 (업무일지 읽기 전용 표시용, IP 포함)
 */
export async function getActivitiesForDate(
  userId: string,
  dateStr: string
): Promise<ActivityForDisplay[]> {
  if (!(prisma as { activityLog?: unknown }).activityLog) return [];
  const dayStart = new Date(dateStr + "T00:00:00");
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const list = await prisma.activityLog.findMany({
    where: {
      userId,
      timestamp: { gte: dayStart, lt: dayEnd },
    },
    orderBy: { timestamp: "asc" },
    select: { actionType: true, targetTitle: true, timestamp: true, ipAddress: true },
  });
  return list.map((a) => ({
    actionType: a.actionType,
    targetTitle: a.targetTitle,
    timestamp: a.timestamp,
    ipAddress: a.ipAddress ?? undefined,
  }));
}

/**
 * 해당 사용자·날짜의 DailyWorkLog가 있으면 반환, 없으면 생성 후 반환.
 * content는 사용자 추가 내용만 저장 (활동 목록은 수정 불가이므로 별도 반환).
 */
export async function getOrCreateDailyWorkLog(
  userId: string,
  dateStr: string
): Promise<{ id: string; date: string; content: string; status: string; activities: ActivityForDisplay[] }> {
  const emptyResult = {
    id: "",
    date: dateStr,
    content: "",
    status: "DRAFT",
    activities: [] as ActivityForDisplay[],
  };
  if (!(prisma as { dailyWorkLog?: unknown }).dailyWorkLog) {
    return { ...emptyResult, content: "(기능을 사용할 수 없습니다.)" };
  }

  const activities = await getActivitiesForDate(userId, dateStr);

  let log = await prisma.dailyWorkLog.findUnique({
    where: { userId_date: { userId, date: dateStr } },
  });

  if (!log) {
    log = await prisma.dailyWorkLog.create({
      data: { userId, date: dateStr, content: "", status: "DRAFT" },
    });
  }

  return {
    id: log.id,
    date: log.date,
    content: log.content,
    status: log.status,
    activities,
  };
}
