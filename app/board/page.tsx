import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { resolveAppModeForUser } from "@/lib/app-mode-server";
import { PageHeadline } from "@/components/page-headline";
import { BoardPageClient } from "./board-page-client";
import { canPostAnnouncement } from "@/lib/role-access";

export default async function BoardPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const appMode = await resolveAppModeForUser(session.user.id, cookieStore);
  if (appMode !== "company") redirect("/choose-mode");

  const role = (session.user as { role?: string }).role;
  const canCreate = true;
  const canCreateAnnouncement = canPostAnnouncement(role);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="게시판"
        description="공지사항, 회사·교육 자료, 자유게시판·익명게시판을 확인하고 올립니다. 자료 카드는 클릭 시 오른쪽에서 미리 볼 수 있고, Ctrl·⌘·Shift 클릭은 새 탭으로 열립니다."
      />
      <BoardPageClient
        canCreate={canCreate}
        canCreateAnnouncement={canCreateAnnouncement}
        currentUserId={session.user.id}
        currentUserRole={role}
      />
    </div>
  );
}
