import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeadline } from "@/components/page-headline";
import { ArrowLeft } from "lucide-react";
import { AdminCompanyForm } from "./admin-company-form";
import prisma from "@/lib/prisma";
import { homePathForUser, isLogisticsOrgDepartment } from "@/lib/org-access";

export default async function AdminCompanyPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");

  const isExecutive = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
  let department = session.user.department ?? null;
  if (!isExecutive && (department == null || department === "")) {
    const row = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { department: true },
    });
    department = row?.department ?? null;
  }
  const canView = isExecutive || isLogisticsOrgDepartment(department);
  if (!canView) {
    redirect(homePathForUser({ role: session.user.role, department }));
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={isExecutive ? "/admin/employees" : "/logistics"}>
            <ArrowLeft className="mr-2 size-4" />
            {isExecutive ? "관리자" : "3PL"}
          </Link>
        </Button>
      </div>
      <PageHeadline
        title="회사 정보"
        description={
          isExecutive
            ? "견적서 등에 표시될 회사 정보를 입력하세요. 관리자만 수정할 수 있습니다."
            : "물류·이체 업무에 필요한 회사 정보입니다. 수정은 관리자만 할 수 있습니다."
        }
      />
      <AdminCompanyForm canEdit={isExecutive} />
    </div>
  );
}
