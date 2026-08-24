import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { PageHeadline } from "@/components/page-headline";
import { isDriveAdminRole } from "@/lib/drive/folder-trash-policy";
import { DriveSharesClient } from "./drive-shares-client";

export default async function DriveSharesAdminPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  if (!isDriveAdminRole(session.user.role)) redirect("/drive");

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="드라이브 팀 공유"
        description="탐색기 폴더에 CRM 부서·직원 Google Drive 권한을 동기화합니다."
      />
      <DriveSharesClient />
    </div>
  );
}
