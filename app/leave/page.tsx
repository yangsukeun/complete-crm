import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { resolveAppModeForUser } from "@/lib/app-mode-server";
import { LeavePageClient } from "./leave-page-client";

export default async function LeavePage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");

  const cookieStore = await cookies();
  const appMode = await resolveAppModeForUser(session.user.id, cookieStore);
  if (appMode !== "company") redirect("/choose-mode");

  const isTeamLead = session.user.role === "TEAM_LEAD";
  const isExecutive = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
  return <LeavePageClient isTeamLead={isTeamLead} isExecutive={isExecutive} />;
}
