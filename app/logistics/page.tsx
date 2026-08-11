import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { PageHeadline } from "@/components/page-headline";
import { Package } from "lucide-react";

export default async function LogisticsPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="3PL 물류"
        description="도약패키지 연동 예정입니다. 현재 준비 중입니다."
      />
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/30 px-6 py-16 text-center">
        <Package className="size-10 text-muted-foreground/70" aria-hidden />
        <p className="text-base font-medium text-foreground">준비중</p>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          도약패키지 연동 예정입니다. 현재 준비 중입니다.
        </p>
      </div>
    </div>
  );
}
