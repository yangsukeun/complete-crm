import { DashboardAttendance } from "@/components/dashboard-attendance";
import { startOfDayKst } from "@/lib/date-kst";
import prisma from "@/lib/prisma";

export async function WorkspaceAttendance({ userId }: { userId: string }) {
  const attendance = await prisma.attendance.findUnique({
    where: { userId_date: { userId, date: startOfDayKst(new Date()) } },
    select: { id: true, checkIn: true, checkOut: true, date: true },
  });
  return <DashboardAttendance initial={attendance ? {
    id: attendance.id,
    checkIn: attendance.checkIn?.toISOString() ?? null,
    checkOut: attendance.checkOut?.toISOString() ?? null,
    date: attendance.date.toISOString(),
  } : null} />;
}
