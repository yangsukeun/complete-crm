import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { isExecutiveOrAdmin } from "@/lib/role-access";
import { AttendanceImportClient } from "./attendance-import-client";

export default async function AttendanceImportPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  if (!isExecutiveOrAdmin(session.user.role)) redirect("/dashboard");
  return (
    <div className="w-full min-h-screen px-4 py-4 lg:px-6 lg:py-6 xl:px-8">
      <AttendanceImportClient />
    </div>
  );
}
