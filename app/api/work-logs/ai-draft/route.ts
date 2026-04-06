import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { taskVisibilityMemberOr } from "@/lib/task-assignees";
import { getActivitiesForDate, stripTaskStatusMarkers } from "@/lib/activity-log";
import { getAiHubConfig } from "@/lib/ai-hub/get-ai-config";
import {
  callAnthropic,
  callGemini,
  callOpenAI,
  type ChatMessage,
} from "@/lib/ai/assist-client";
import { parse, startOfDay, endOfDay } from "date-fns";

export const dynamic = "force-dynamic";

function hubProviderForModel(model: string): "claude" | "openai" | "gemini" {
  if (model === "openai" || model === "gpt") return "openai";
  if (model === "gemini") return "gemini";
  return "claude";
}

async function runSingleHubCall(
  provider: "claude" | "openai" | "gemini",
  messagesFull: ChatMessage[],
  config: ReturnType<typeof getAiHubConfig>
): Promise<string> {
  if (provider === "claude") {
    const k = config.claudeKey;
    if (!k) throw new Error("Claude API 키가 없습니다.");
    return callAnthropic(k, messagesFull, {
      model: config.claudeModel,
      useParamApiKeyOnly: true,
    });
  }
  if (provider === "openai") {
    const k = config.openaiKey;
    if (!k) throw new Error("OpenAI API 키가 없습니다.");
    return callOpenAI(k, messagesFull, { model: config.openaiModel });
  }
  const k = config.geminiKey;
  if (!k) throw new Error("Gemini API 키가 없습니다.");
  return callGemini(k, messagesFull, { model: config.geminiModel });
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { date?: string };
    const date = typeof body.date === "string" ? body.date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "날짜는 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 });
    }

    const userId = session.user.id;
    const userName = session.user.name ?? "직원";
    const scope = await getServerWorkspaceScopeFromRequest(req);
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const visibilityWhere =
      scope === "PERSONAL"
        ? { scope: "PERSONAL" as const, OR: taskVisibilityMemberOr(userId) }
        : { scope: "TEAM" as const, ...(isAdmin ? {} : { OR: taskVisibilityMemberOr(userId) }) };

    const taskMemberFilter = {
      OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }],
    };

    const activitiesRaw = await getActivitiesForDate(userId, date);
    const activities = activitiesRaw.map((a) => ({
      actionType: a.actionType,
      targetTitle: a.targetTitle,
    }));

    const anchor = parse(date, "yyyy-MM-dd", new Date());
    if (Number.isNaN(anchor.getTime())) {
      return NextResponse.json({ error: "유효하지 않은 날짜입니다." }, { status: 400 });
    }
    const d0 = startOfDay(anchor);
    const d1 = endOfDay(anchor);

    const [dueTasks, inProgressTasks, recurringAll, existingLog] = await Promise.all([
      prisma.task.findMany({
        where: {
          deletedAt: null,
          ...visibilityWhere,
          dueDate: { gte: d0, lte: d1 },
          ...taskMemberFilter,
        },
        select: { title: true, status: true },
        take: 50,
      }),
      prisma.task.findMany({
        where: {
          deletedAt: null,
          ...visibilityWhere,
          status: { in: ["IN_PROGRESS", "TODO"] },
          isCompleted: false,
          ...taskMemberFilter,
        },
        take: 10,
        orderBy: { dueDate: "asc" },
        select: { title: true, status: true, dueDate: true },
      }),
      prisma.task.findMany({
        where: {
          deletedAt: null,
          isRecurring: true,
          ...visibilityWhere,
          OR: [
            { assignedToId: userId },
            { createdById: userId },
            { assignees: { some: { userId } } },
          ],
        },
        select: { title: true, recurringDays: true, recurringMemo: true },
      }),
      prisma.dailyWorkLog.findUnique({
        where: { userId_date: { userId, date } },
        select: { content: true },
      }),
    ]);

    const dateMid = new Date(`${date}T12:00:00`);
    const todayDay = dateMid.getDay() === 0 ? 7 : dateMid.getDay();

    const recurringTasks = recurringAll.filter((t) => {
      if (!t.recurringDays) return false;
      try {
        const days = JSON.parse(t.recurringDays) as unknown;
        if (!Array.isArray(days)) return false;
        return days.some((n) => Number(n) === todayDay);
      } catch {
        return false;
      }
    });

    const activitySummary =
      activities.length > 0
        ? activities.map((a) => `- ${a.actionType}: ${a.targetTitle}`).join("\n")
        : "활동 기록 없음";

    const dueTasksSummary =
      dueTasks.length > 0
        ? dueTasks.map((t) => `- [${t.status}] ${t.title}`).join("\n")
        : "오늘 마감 업무 없음";

    const inProgressSummary =
      inProgressTasks.length > 0
        ? inProgressTasks
            .map(
              (t) =>
                `- [${t.status}] ${t.title}${
                  t.dueDate ? ` (마감: ${t.dueDate.toLocaleDateString("ko-KR")})` : ""
                }`
            )
            .join("\n")
        : "진행 중 업무 없음";

    const recurringSummary =
      recurringTasks.length > 0
        ? recurringTasks
            .map((t) => `- ${t.title}${t.recurringMemo ? ` (${t.recurringMemo})` : ""}`)
            .join("\n")
        : "오늘 반복 업무 없음";

    const existingSnippet = existingLog?.content
      ? stripTaskStatusMarkers(existingLog.content).trim().slice(0, 500)
      : "";

    const systemPrompt = `당신은 업무일지 작성을 도와주는 AI입니다.
아래 데이터를 바탕으로 자연스러운 업무일지 초안을 마크다운으로 작성하세요.

작성 규칙:
- 간결하고 명확하게 작성
- 반복 업무는 반드시 포함
- 완료된 업무, 진행 중인 업무, 예정 업무 구분
- 이모지 없이 깔끔하게
- 직원이 수정하기 쉽게 섹션 구분

형식:
## ${date} 업무일지

### 오늘의 반복 업무
(반복 업무 목록)

### 완료한 업무
(ActivityLog 기반)

### 진행 중인 업무
(현재 진행 중 Task)

### 오늘 마감 업무
(오늘 마감 Task)

### 특이사항
(직원이 직접 작성할 공간)
`;

    const userMessage = `
직원명: ${userName}
날짜: ${date}

[오늘의 반복 업무]
${recurringSummary}

[당일 활동 기록]
${activitySummary}

[오늘 마감 업무]
${dueTasksSummary}

[진행 중인 업무]
${inProgressSummary}

${existingSnippet ? `[기존 작성 내용 참고]\n${existingSnippet}` : ""}
`.trim();

    const role = (session.user as { role?: string }).role;
    const config = getAiHubConfig(role);
    const targetModel = config.isExecutive ? "claude" : "gemini";
    const provider = hubProviderForModel(targetModel);
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    const draft = await runSingleHubCall(provider, messages, config);

    return NextResponse.json({ draft });
  } catch (e) {
    console.error("[work-logs/ai-draft]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "초안 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
