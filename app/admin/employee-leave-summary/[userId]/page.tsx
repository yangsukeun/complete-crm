import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import {
  canViewEmployeeLeaveSummary,
  isCsLeaveOverviewDepartment,
  leaveSummaryScope,
} from "@/lib/leave-overview-access";
import { homePathForUser } from "@/lib/org-access";
import { LeaveDetailClient } from "./leave-detail-client";

type Props = { params: Promise<{ userId: string }> };

export default async function EmployeeLeaveDetailPage({ params }: Props) {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  const { userId } = await params;

  const [me, target] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, department: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { department: true },
    }),
  ]);
  const viewer = {
    role: me?.role ?? session.user.role,
    department: me?.department ?? session.user.department,
  };
  if (!canViewEmployeeLeaveSummary(viewer)) {
    redirect(homePathForUser(viewer));
  }
  if (leaveSummaryScope(viewer) === "cs" && !isCsLeaveOverviewDepartment(target?.department)) {
    redirect("/admin/employee-leave-summary");
  }

  return (
    <div className="w-full min-h-screen px-4 py-4 lg:px-6 lg:py-6 xl:px-8">
      <LeaveDetailClient userId={userId} />
    </div>
  );
}
