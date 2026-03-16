import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PageHeadline } from "@/components/page-headline";
import { BoardPageClient } from "./board-page-client";

export default async function BoardPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const appMode = cookieStore.get("app_mode")?.value;
  if (appMode !== "company") redirect("/choose-mode");

  const role = (session.user as { role?: string }).role;
  const canCreate = true;
  const canCreateAnnouncement =
    role === "TEAM_LEAD" || role === "EXECUTIVE" || role === "ADMIN";

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="게시판"
        description="공지사항과 회사 자료·교육자료를 확인하고 올립니다."
      />
      <BoardPageClient
        canCreate={canCreate}
        canCreateAnnouncement={canCreateAnnouncement}
        currentUserId={session.user.id}
      />
    </div>
  );
}
