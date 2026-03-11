import { format, subDays } from "date-fns";
import prisma from "@/lib/prisma";

export type ActivityActionType = "TASK_CREATED" | "TASK_COMPLETED" | "COMMENT_ADDED" | "SCHEDULE_CREATED" | "LOGIN" | "CHECK_IN" | "CHECK_OUT";

/**
 * 활동 로그 1건 기록 (업무 생성/완료/댓글/일정 등록/로그인/출퇴근)
 * @param ipAddress 출퇴근 시 IP (업무일지에 수정 불가로 표시)
 * @param options.timestamp 지정 시 그 시각으로 기록되어 해당 날짜의 업무일지에 표시
 */
export async function createActivityLog(
  userId: string,
  actionType: ActivityActionType,
  targetTitle: string,
  ipAddress?: string | null,
  options?: { timestamp?: Date }
): Promise<void> {
  if (!(prisma as { activityLog?: unknown }).activityLog) return;
  try {
    await prisma.activityLog.create({
      data: {
        userId,
        actionType,
        targetTitle: targetTitle || "(제목 없음)",
        ...(ipAddress != null && ipAddress !== "" ? { ipAddress } : {}),
        ...(options?.timestamp ? { timestamp: options.timestamp } : {}),
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
  const lines = activities.map((a: any) => {
    const time = format(new Date(a.timestamp), "HH:mm");
    const label =
      a.actionType === "TASK_CREATED"
        ? "업무 생성"
        : a.actionType === "TASK_COMPLETED"
          ? "업무 완료"
          : a.actionType === "COMMENT_ADDED"
            ? "댓글 작성"
            : a.actionType === "SCHEDULE_CREATED"
              ? "일정 등록"
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
  return list.map((a: any) => ({
    actionType: a.actionType,
    targetTitle: a.targetTitle,
    timestamp: a.timestamp,
    ipAddress: a.ipAddress ?? undefined,
  }));
}

/** 전날 일지에서 "내일 할일" / "다음날 할일" 블록 추출 (## 내일 할일, - 내일 할일 등) */
function extractTomorrowSection(prevContent: string): string {
  if (!prevContent?.trim()) return "";
  const markers = [
    /##\s*내일\s*할일[\s\S]*?(?=\n##|$)/i,
    /##\s*다음날\s*할일[\s\S]*?(?=\n##|$)/i,
    /내일\s*할일\s*[:：]\s*\n([\s\S]*?)(?=\n\n|\n##|$)/i,
    /-\s*내일\s*할일[^\n]*\n([\s\S]*?)(?=\n\n|\n##|$)/i,
  ];
  for (const re of markers) {
    const m = prevContent.match(re);
    if (m) {
      const block = (m[1] ?? m[0]).replace(/^##\s*내일\s*할일\s*/i, "").replace(/^##\s*다음날\s*할일\s*/i, "").trim();
      if (block) return `## 내일 할일 (전날에서 이월)\n\n${block}\n\n`;
    }
  }
  return "";
}

/** 해당 월의 다른 일지에서 "N일까지" 형태 라인 수집 (해당 월 마감/일정 참고용) */
export async function getMonthDeadlineLines(
  userId: string,
  yearMonth: string
): Promise<string[]> {
  if (!(prisma as { dailyWorkLog?: unknown }).dailyWorkLog) return [];
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return [];
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const logs = await prisma.dailyWorkLog.findMany({
    where: { userId, date: { gte: start, lte: end } },
    select: { content: true },
  });
  const re = /\d{1,2}\s*일\s*까지[^\n]*/g;
  const set = new Set<string>();
  for (const { content } of logs) {
    const matches = content.match(re) ?? [];
    matches.forEach((line) => set.add(line.trim()));
  }
  return Array.from(set);
}

/**
 * 해당 사용자·날짜의 DailyWorkLog가 있으면 반환, 없으면 생성 후 반환.
 * 새로 만들 때 전날 일지의 "내일 할일" 블록을 이날 content에 반영.
 */
export async function getOrCreateDailyWorkLog(
  userId: string,
  dateStr: string
): Promise<{ id: string; date: string; content: string; status: string; activities: ActivityForDisplay[]; monthDeadlines?: string[] }> {
  const emptyResult = {
    id: "",
    date: dateStr,
    content: "",
    status: "DRAFT",
    activities: [] as ActivityForDisplay[],
    monthDeadlines: [] as string[],
  };
  if (!(prisma as { dailyWorkLog?: unknown }).dailyWorkLog) {
    return { ...emptyResult, content: "(기능을 사용할 수 없습니다.)" };
  }

  const activities = await getActivitiesForDate(userId, dateStr);
  const [y, m] = dateStr.split("-");
  const yearMonth = `${y}-${m}`;

  let log = await prisma.dailyWorkLog.findUnique({
    where: { userId_date: { userId, date: dateStr } },
  });

  if (!log) {
    const prevDate = format(subDays(new Date(dateStr + "T12:00:00"), 1), "yyyy-MM-dd");
    const prevLog = await prisma.dailyWorkLog.findUnique({
      where: { userId_date: { userId, date: prevDate } },
      select: { content: true },
    });
    const carried = extractTomorrowSection(prevLog?.content ?? "");
    log = await prisma.dailyWorkLog.create({
      data: { userId, date: dateStr, content: carried, status: "DRAFT" },
    });
  }

  const monthDeadlines = await getMonthDeadlineLines(userId, yearMonth);

  return {
    id: log.id,
    date: log.date,
    content: log.content,
    status: log.status,
    activities,
    monthDeadlines,
  };
}
