import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeadline } from "@/components/page-headline";
import { NotificationsPageClient } from "./notifications-page-client";

export default async function NotificationsPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="알림"
        description="모든 알림을 확인하고 관리합니다."
      />
      <NotificationsPageClient />
    </div>
  );
}
