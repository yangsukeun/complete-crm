import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeadline } from "@/components/page-headline";
import { ArrowLeft } from "lucide-react";
import { DepartmentsPositionsClient } from "./departments-positions-client";

export default async function AdminDepartmentsPositionsPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/employees">
            <ArrowLeft className="mr-2 size-4" />
            관리자
          </Link>
        </Button>
      </div>
      <PageHeadline
        title="부서·직책 관리"
        description="부서명과 직책을 등록해 두면, 기본정보(내 정보·직원)에서 스크롤로 선택해 부여할 수 있습니다."
      />
      <DepartmentsPositionsClient />
    </div>
  );
}
