import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { AssigneeStagesClient } from "./assignee-stages-client";

export default async function AssigneeStagesPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  const { userId } = await params;

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <AssigneeStagesClient userId={userId} />
    </div>
  );
}
