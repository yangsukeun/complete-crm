import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { EmployeeLeaveSummaryClient } from "./employee-leave-summary-client";

export default async function EmployeeLeaveSummaryPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  const role = String(session.user.role ?? "").toUpperCase();
  if (role !== "EXECUTIVE" && role !== "ADMIN") redirect("/dashboard");
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <EmployeeLeaveSummaryClient />
    </div>
  );
}
