import prisma from "@/lib/prisma";
import { isExecutiveLike } from "@/lib/ai-secretary/prompts";

/**
 * 대화 시점 기준 역할에 맞는 DB 컨텍스트 문자열 (시스템 메시지에 붙임)
 */
export async function buildSecretaryDataContext(params: {
  userId: string;
  role: string;
  dateKey: string;
}): Promise<string> {
  const { userId, role, dateKey } = params;
  const dayStart = new Date(`${dateKey}T00:00:00+09:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, department: true, position: true, email: true },
  });

  const schedules = await prisma.schedule.findMany({
    where: { userId, startTime: { gte: dayStart, lt: dayEnd } },
    orderBy: { startTime: "asc" },
    select: { title: true, startTime: true, endTime: true, isAllDay: true },
  });

  const myTasks = await prisma.task.findMany({
    where: { assignedToId: userId, isCompleted: false },
    orderBy: { dueDate: "asc" },
    take: 40,
    select: { title: true, status: true, dueDate: true },
  });

  const lines: string[] = [];
  lines.push("### 참고 데이터 (시스템에서 자동 로드됨)");
  lines.push(`- 직원: ${user?.name ?? "?"} (${user?.email ?? ""})`);
  lines.push(`- 부서: ${user?.department ?? "미지정"} / 직책: ${user?.position ?? "미지정"}`);
  lines.push(`- 대화 기준일(KST): ${dateKey}`);
  lines.push("");
  lines.push(`### 해당일 일정 (${dateKey})`);
  if (schedules.length === 0) lines.push("- (없음)");
  else {
    for (const s of schedules) {
      const t = s.isAllDay
        ? "종일"
        : `${fmtKst(s.startTime)} ~ ${fmtKst(s.endTime)}`;
      lines.push(`- ${s.title} (${t})`);
    }
  }
  lines.push("");
  lines.push("### 본인 진행 중·미완료 업무 (일부)");
  if (myTasks.length === 0) lines.push("- (없음)");
  else {
    for (const t of myTasks) {
      lines.push(`- [${t.status}] ${t.title} (마감: ${t.dueDate.toISOString().slice(0, 10)})`);
    }
  }

  if (isExecutiveLike(role)) {
    const employees = await prisma.user.findMany({
      select: { id: true, name: true, department: true, position: true },
      orderBy: { name: "asc" },
    });
    const openByUser = await prisma.task.groupBy({
      by: ["assignedToId"],
      where: { isCompleted: false, assignedToId: { not: null } },
      _count: { _all: true },
    });
    const countMap = new Map(openByUser.map((x) => [x.assignedToId!, x._count._all]));

    lines.push("");
    lines.push("### 전체 직원·미완료 업무 건수 (요약)");
    for (const e of employees) {
      const c = countMap.get(e.id) ?? 0;
      lines.push(`- ${e.name} (${e.department ?? "부서"} / ${e.position ?? "직책"}): 미완료 ${c}건`);
    }

    const allOpen = await prisma.task.findMany({
      where: { isCompleted: false },
      orderBy: { dueDate: "asc" },
      take: 80,
      select: {
        title: true,
        status: true,
        dueDate: true,
        assignedTo: { select: { name: true } },
      },
    });
    lines.push("");
    lines.push("### 전사 미완료 업무 목록 (최대 80건)");
    if (allOpen.length === 0) lines.push("- (없음)");
    else {
      for (const t of allOpen) {
        lines.push(
          `- [${t.status}] ${t.title} | 담당: ${t.assignedTo?.name ?? "미배정"} | 마감: ${t.dueDate.toISOString().slice(0, 10)}`
        );
      }
    }
  }

  return lines.join("\n");
}

function fmtKst(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
