import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { PageHeadline } from "@/components/page-headline";
import { isDriveAdminRole } from "@/lib/drive/folder-trash-policy";
import { DriveTrashClient } from "./drive-trash-client";

export default async function DriveTrashPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  if (!isDriveAdminRole(session.user.role)) redirect("/drive");

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="드라이브 휴지통"
        description="삭제한 폴더(및 soft-trash 항목)를 복원할 수 있습니다. 대표/관리자 전용."
      />
      <DriveTrashClient />
    </div>
  );
}
