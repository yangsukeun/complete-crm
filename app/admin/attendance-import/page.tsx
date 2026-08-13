import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { isExecutiveOrAdmin } from "@/lib/role-access";
import { userHasPermission } from "@/lib/permissions";
import { resolveEffectivePermissionsJson } from "@/lib/permissions-resolve";
import { AttendanceImportClient } from "./attendance-import-client";

export default async function AttendanceImportPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  const permissions = await resolveEffectivePermissionsJson(session.user.id);
  if (!userHasPermission({ role: session.user.role, permissions }, "attendance_import")) {
    redirect("/dashboard");
  }
  return (
    <div className="w-full min-h-screen px-4 py-4 lg:px-6 lg:py-6 xl:px-8">
      <AttendanceImportClient canCreateCsAccounts={isExecutiveOrAdmin(session.user.role)} />
    </div>
  );
}
