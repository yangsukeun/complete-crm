import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canViewEmployeeLeaveSummary } from "@/lib/leave-overview-access";
import { homePathForUser } from "@/lib/org-access";
import { EmployeeLeaveSummaryClient } from "./employee-leave-summary-client";

export default async function EmployeeLeaveSummaryPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, department: true },
  });
  const viewer = {
    role: me?.role ?? session.user.role,
    department: me?.department ?? session.user.department,
  };
  if (!canViewEmployeeLeaveSummary(viewer)) {
    redirect(homePathForUser(viewer));
  }
  return (
    <div className="w-full min-h-screen px-4 py-4 lg:px-6 lg:py-6 xl:px-8">
      <EmployeeLeaveSummaryClient />
    </div>
  );
}
