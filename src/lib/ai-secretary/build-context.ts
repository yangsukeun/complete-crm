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
    /** EXECUTIVE/ADMIN: 전 직원 — 시스템이 로드한 사실 데이터로 AI가 그대로 인용 가능하게 */
    const employees = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        position: true,
        phone: true,
        workPhone: true,
        workEmail: true,
      },
      orderBy: { name: "asc" },
    });
    const openByUser = await prisma.task.groupBy({
      by: ["assignedToId"],
      where: { isCompleted: false, assignedToId: { not: null } },
      _count: { _all: true },
    });
    const countMap = new Map(openByUser.map((x) => [x.assignedToId!, x._count._all]));

    lines.push("");
    lines.push("=== 직원 연락처 목록 ===");
    lines.push(
      "(회사 전체 직원 DB 기준. 사용자가 이름·이메일·부서·연락처를 물으면 아래 줄을 근거로 답하세요.)"
    );
    for (const e of employees) {
      const emailDisplay = [e.workEmail, e.email].filter(Boolean).join(" · ") || "없음";
      const contactDisplay = [e.phone, e.workPhone].filter(Boolean).join(" / ") || "없음";
      lines.push(
        `- 이름: ${e.name} | 이메일: ${emailDisplay} | 부서: ${e.department ?? "미지정"} | 연락처: ${contactDisplay}`
      );
    }

    lines.push("");
    lines.push("### 직원별 미완료 업무 건수 (참고)");
    for (const e of employees) {
      const c = countMap.get(e.id) ?? 0;
      lines.push(`- ${e.name}: ${c}건`);
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
