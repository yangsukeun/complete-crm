import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canViewAwayOverview } from "@/lib/attendance-away-access";
import { CsTeamAttendanceClient } from "./cs-team-attendance-client";

export default async function CsTeamAttendancePage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, department: true },
  });
  if (!me || !canViewAwayOverview(me)) redirect("/cs-tools");
  return (
    <div className="w-full min-h-screen px-4 py-4 lg:px-6 lg:py-6 xl:px-8">
      <CsTeamAttendanceClient />
    </div>
  );
}
