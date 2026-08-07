import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { PageHeadline } from "@/components/page-headline";
import { isNasConfigured } from "@/lib/nas/config";
import { NasDrivePageClient } from "./nas-drive-page-client";

export default async function NasDrivePage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const configured = isNasConfigured();

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="NAS 문서함"
        description="시놀로지 문서 공유 폴더 목록입니다. 실제 파일 열람은 NAS 로그인 후 진행됩니다."
      />
      {!configured ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
          role="status"
        >
          NAS 문서함이 아직 연결되지 않았습니다. NAS_QUICKCONNECT_URL,
          NAS_SERVICE_ACCOUNT_USER, NAS_SERVICE_ACCOUNT_PASSWORD,
          NAS_DOCUMENTS_SHARE_PATH 설정이 필요합니다. (GOOGLE_DRIVE_* 와 별도)
        </div>
      ) : (
        <NasDrivePageClient />
      )}
    </div>
  );
}
