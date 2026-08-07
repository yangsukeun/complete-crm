import { Suspense } from "react";
import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeadline } from "@/components/page-headline";
import { isDriveExplorerFolderConfigured } from "@/lib/drive/explorer-root";
import { DrivePageClient } from "./drive-page-client";

export default async function DrivePage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const role = String(session.user.role ?? "").toUpperCase();
  const isAdmin = role === "ADMIN" || role === "EXECUTIVE";
  const canDeleteFiles = isAdmin || role === "TEAM_LEAD";
  const explorerConfigured = isDriveExplorerFolderConfigured();
  const showExplorerSetupBanner = isAdmin && !explorerConfigured;

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="파일"
        description="Google Drive와 동기화된 폴더·파일을 탐색합니다. 시놀로지 문서함은 「NAS 문서함」메뉴를 사용하세요."
      />
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">탐색기를 불러오는 중…</p>
        }
      >
        <DrivePageClient
          showExplorerSetupBanner={showExplorerSetupBanner}
          canDeleteFiles={canDeleteFiles}
          explorerConfigured={explorerConfigured}
        />
      </Suspense>
    </div>
  );
}
