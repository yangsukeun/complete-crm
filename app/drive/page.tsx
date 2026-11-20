import Link from "next/link";
import { Suspense } from "react";
import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeadline } from "@/components/page-headline";
import { isDriveExplorerFolderConfigured } from "@/lib/drive/explorer-root";
import { DrivePageClient } from "./drive-page-client";
import { workspaceAreas } from "@/lib/workspace-areas";
import "./drive-board.css";

export default async function DrivePage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const boardLayout = workspaceAreas(session.user).some(
    (area) => area === "management" || area === "marketing" || area === "logistics"
  );
  const role = String(session.user.role ?? "").toUpperCase();
  const isAdmin = role === "ADMIN" || role === "EXECUTIVE";
  const canDeleteFiles = isAdmin || role === "TEAM_LEAD";
  const explorerConfigured = isDriveExplorerFolderConfigured();
  const showExplorerSetupBanner = isAdmin && !explorerConfigured;

  return (
    <div data-drive-board={boardLayout ? "enabled" : undefined} className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title={boardLayout ? "Google Drive 자료함" : "파일"}
        description="Google Drive와 동기화된 폴더·파일을 탐색합니다. 시놀로지 문서함은 「NAS 문서함」메뉴를 사용하세요."
      />
      {boardLayout && (
        <nav aria-label="문서함 종류" className="flex min-w-0 flex-wrap gap-2">
          <span aria-current="page" className="rounded-lg bg-violet-100 px-3 py-2 text-sm font-semibold text-violet-900">Google Drive</span>
          <Link href="/nas-drive" prefetch={false} className="rounded-lg border px-3 py-2 text-sm font-medium">NAS 문서함</Link>
        </nav>
      )}
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">탐색기를 불러오는 중…</p>
        }
      >
        <DrivePageClient
          showExplorerSetupBanner={showExplorerSetupBanner}
          canDeleteFiles={canDeleteFiles}
          explorerConfigured={explorerConfigured}
          viewerUserId={session.user.id}
          viewerRole={role}
          isDriveAdmin={isAdmin}
        />
      </Suspense>
    </div>
  );
}
