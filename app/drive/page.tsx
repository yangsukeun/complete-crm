import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeadline } from "@/components/page-headline";
import { DrivePageClient } from "./drive-page-client";

export default async function DrivePage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="파일"
        description="Google Drive와 동기화된 폴더·파일을 탐색합니다. 동기화 후 목록이 표시됩니다."
      />
      <DrivePageClient />
    </div>
  );
}
