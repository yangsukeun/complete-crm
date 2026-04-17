import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { taskVisibilityMemberOr } from "@/lib/task-assignees";

export const dynamic = "force-dynamic";

/** 1=월 … 7=일 (일요일은 7) */
function recurringDayForDate(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function diffDays(a: Date, b: Date): number {
  const a0 = new Date(a);
  a0.setHours(12, 0, 0, 0);
  const b0 = new Date(b);
  b0.setHours(12, 0, 0, 0);
  return Math.floor((b0.getTime() - a0.getTime()) / (24 * 60 * 60 * 1000));
}

function diffWeeks(a: Date, b: Date): number {
  return Math.floor(diffDays(a, b) / 7);
}

function diffMonths(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function parseLegacyWeekdays(recurringDays: string | null): number[] {
  if (!recurringDays) return [];
  try {
    const days = JSON.parse(recurringDays) as unknown;
    if (!Array.isArray(days)) return [];
    return days.map((n) => Number(n)).filter((n) => n >= 1 && n <= 7);
  } catch {
    return [];
  }
}

function matchesRecurringRule(params: {
  targetDate: Date;
  taskDueDate: Date | null;
  recurringDays: string | null;
  recurringRule: any;
}): boolean {
  const { targetDate, taskDueDate, recurringDays, recurringRule } = params;
  if (!taskDueDate || Number.isNaN(new Date(taskDueDate).getTime())) return false;
  const weekday = recurringDayForDate(targetDate);

  const rule = recurringRule && typeof recurringRule === "object" ? recurringRule : null;
  if (!rule) {
    const days = parseLegacyWeekdays(recurringDays);
    return days.includes(weekday);
  }

  const freq = String(rule.freq || "WEEKLY").toUpperCase();
  const interval = Math.max(1, Math.floor(Number(rule.interval || 1) || 1));

  if (freq === "HOURLY") {
    // day view에서는 해당 날짜에 표시만 (시간 단위는 별도 UI에서 처리)
    return true;
  }
  if (freq === "DAILY") {
    const d = diffDays(taskDueDate, targetDate);
    return d >= 0 && d % interval === 0;
  }
  if (freq === "WEEKLY") {
    const days = Array.isArray(rule.weekdays)
      ? rule.weekdays.map((n: any) => Number(n)).filter((n: number) => n >= 1 && n <= 7)
      : parseLegacyWeekdays(recurringDays);
    if (!days.includes(weekday)) return false;
    const w = diffWeeks(taskDueDate, targetDate);
    return w >= 0 && w % interval === 0;
  }
  if (freq === "MONTHLY") {
    const monthDay = Math.min(
      31,
      Math.max(1, Math.floor(Number(rule.monthDay || taskDueDate.getDate()) || taskDueDate.getDate()))
    );
    if (targetDate.getDate() !== monthDay) return false;
    const m = diffMonths(taskDueDate, targetDate);
    return m >= 0 && m % interval === 0;
  }
  // unknown → legacy weekly
  const legacy = parseLegacyWeekdays(recurringDays);
  return legacy.includes(weekday);
}

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const targetDate =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? new Date(`${dateParam}T12:00:00`)
        : new Date();

    const scope = await getServerWorkspaceScopeFromRequest(req);
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const visibilityWhere =
      scope === "PERSONAL"
        ? { scope: "PERSONAL" as const, OR: taskVisibilityMemberOr(session.user.id) }
        : { scope: "TEAM" as const, ...(isAdmin ? {} : { OR: taskVisibilityMemberOr(session.user.id) }) };

    const tasks = await prisma.task.findMany({
      where: {
        deletedAt: null,
        isRecurring: true,
        dueDate: { not: null },
        ...visibilityWhere,
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        recurringDays: true,
        recurringRule: true,
        recurringMemo: true,
        isRecurring: true,
      },
    });

    const todayTasks = tasks.filter((t) =>
      matchesRecurringRule({
        targetDate,
        taskDueDate: t.dueDate,
        recurringDays: t.recurringDays ?? null,
        recurringRule: (t as any).recurringRule,
      })
    );

    return NextResponse.json(todayTasks);
  } catch (e) {
    console.error("[tasks/recurring GET]", e);
    return NextResponse.json({ error: "반복 업무를 불러올 수 없습니다." }, { status: 500 });
  }
}
