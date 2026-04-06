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

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    let targetDay: number;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      targetDay = recurringDayForDate(new Date(`${dateParam}T12:00:00`));
    } else {
      targetDay = recurringDayForDate(new Date());
    }

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
        ...visibilityWhere,
        OR: [
          { assignedToId: session.user.id },
          { createdById: session.user.id },
          { assignees: { some: { userId: session.user.id } } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        recurringDays: true,
        recurringMemo: true,
        isRecurring: true,
      },
    });

    const todayTasks = tasks.filter((t) => {
      if (!t.recurringDays) return false;
      try {
        const days = JSON.parse(t.recurringDays) as unknown;
        if (!Array.isArray(days)) return false;
        return days.some((n) => Number(n) === targetDay);
      } catch {
        return false;
      }
    });

    return NextResponse.json(todayTasks);
  } catch (e) {
    console.error("[tasks/recurring GET]", e);
    return NextResponse.json({ error: "반복 업무를 불러올 수 없습니다." }, { status: 500 });
  }
}
