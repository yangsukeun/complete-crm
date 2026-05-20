import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { LeaveDetailClient } from "./leave-detail-client";

type Props = { params: Promise<{ userId: string }> };

export default async function EmployeeLeaveDetailPage({ params }: Props) {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  const role = String(session.user.role ?? "").toUpperCase();
  if (role !== "EXECUTIVE" && role !== "ADMIN") redirect("/dashboard");

  const { userId } = await params;

  return (
    <div className="w-full min-h-screen px-4 py-4 lg:px-6 lg:py-6 xl:px-8">
      <LeaveDetailClient userId={userId} />
    </div>
  );
}
