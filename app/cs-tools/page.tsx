import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { PageHeadline } from "@/components/page-headline";
import { CsToolsPageClient } from "./cs-tools-page-client";

export default async function CsToolsPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="CS 링크 허브"
        description="CS 업무에 쓰는 외부 도구·링크를 한곳에서 엽니다."
      />
      <CsToolsPageClient />
    </div>
  );
}
