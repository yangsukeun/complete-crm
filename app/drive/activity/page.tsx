import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { PageHeadline } from "@/components/page-headline";
import { isDriveAdminRole } from "@/lib/drive/folder-trash-policy";
import { DriveActivityClient } from "./drive-activity-client";

export default async function DriveActivityPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  if (!isDriveAdminRole(session.user.role)) redirect("/drive");

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="드라이브 활동 이력"
        description="폴더 삭제·복원 등 DriveActivityLog 기록. 대표/관리자 전용."
      />
      <DriveActivityClient />
    </div>
  );
}
