import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeadline } from "@/components/page-headline";
import { StagesOverviewClient } from "./stages-overview-client";

export default async function StagesPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="단계 진행 현황"
        description="프로젝트별로 지금 어느 단계인지, 단계마다 누가 맡아 어디까지 했는지 봅니다. 담당자 이름을 누르면 그 직원의 담당자 페이지가 열립니다."
      />
      <StagesOverviewClient />
    </div>
  );
}
