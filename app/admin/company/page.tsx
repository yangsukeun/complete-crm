import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeadline } from "@/components/page-headline";
import { ArrowLeft } from "lucide-react";
import { AdminCompanyForm } from "./admin-company-form";

export default async function AdminCompanyPage() {
  const session = await auth();
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
        title="회사 정보"
        description="견적서 등에 표시될 회사 정보를 입력하세요. 관리자만 수정할 수 있습니다."
      />
      <AdminCompanyForm />
    </div>
  );
}
