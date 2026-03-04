import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PageHeadline } from "@/components/page-headline";
import { AnnouncementsPageClient } from "./announcements-page-client";

export default async function AnnouncementsPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const appMode = cookieStore.get("app_mode")?.value;
  if (appMode !== "company") redirect("/choose-mode");

  const role = (session.user as { role?: string }).role ?? "USER";
  const canCreate =
    role === "TEAM_LEAD" || role === "EXECUTIVE" || role === "ADMIN";

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline title="공지사항" description="회사 공지사항을 작성하고 확인합니다." />
      <AnnouncementsPageClient canCreate={canCreate} />
    </div>
  );
}
