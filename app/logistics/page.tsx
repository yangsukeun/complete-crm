import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { PageHeadline } from "@/components/page-headline";
import { Package, Building2, Wallet, CalendarClock } from "lucide-react";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { isLogisticsOrgDepartment, resolveOrgUnit } from "@/lib/org-access";

export default async function LogisticsPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  let department = session.user.department ?? null;
  if (department == null || department === "") {
    const row = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { department: true },
    });
    department = row?.department ?? null;
  }
  const org = resolveOrgUnit({ role: session.user.role, department });
  const isStaffHome = org === "LOGISTICS" || isLogisticsOrgDepartment(department);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="3PL 물류"
        description="도약패키지 연동, 회사 정보, 이체 요청, 휴가를 이 화면에서 이어갑니다."
      />
      {isStaffHome && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/admin/company"
            className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm shadow-sm transition-colors hover:bg-muted/40"
          >
            <Building2 className="size-5 text-primary" aria-hidden />
            <span>
              <span className="block font-medium">회사 정보</span>
              <span className="text-muted-foreground text-xs">사업자·계좌 등</span>
            </span>
          </Link>
          <Link
            href="/finance/requests"
            className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm shadow-sm transition-colors hover:bg-muted/40"
          >
            <Wallet className="size-5 text-primary" aria-hidden />
            <span>
              <span className="block font-medium">이체 요청</span>
              <span className="text-muted-foreground text-xs">자금 결재</span>
            </span>
          </Link>
          <Link
            href="/leave"
            className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm shadow-sm transition-colors hover:bg-muted/40"
          >
            <CalendarClock className="size-5 text-primary" aria-hidden />
            <span>
              <span className="block font-medium">연차/근태</span>
              <span className="text-muted-foreground text-xs">휴가 신청·승인</span>
            </span>
          </Link>
        </div>
      )}
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/30 px-6 py-16 text-center">
        <Package className="size-10 text-muted-foreground/70" aria-hidden />
        <p className="text-base font-medium text-foreground">도약패키지 연동</p>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          도약패키지 연동 예정입니다. 현재 준비 중입니다.
        </p>
      </div>
    </div>
  );
}
