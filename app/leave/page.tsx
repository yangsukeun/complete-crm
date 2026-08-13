import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { resolveAppModeForUser } from "@/lib/app-mode-server";
import { isCsTeamDepartment } from "@/lib/cs-team-permissions";
import { LeavePageClient } from "./leave-page-client";

export default async function LeavePage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");

  const cookieStore = await cookies();
  const appMode = await resolveAppModeForUser(session.user.id, cookieStore);
  if (appMode !== "company") redirect("/choose-mode");

  const role = String(session.user.role ?? "").toUpperCase();
  const isFirstApprover =
    role === "TEAM_LEAD" || (role === "CENTER_CHIEF" && isCsTeamDepartment(session.user.department));
  const isExecutive = role === "EXECUTIVE" || role === "ADMIN";
  return <LeavePageClient isTeamLead={isFirstApprover} isExecutive={isExecutive} />;
}
