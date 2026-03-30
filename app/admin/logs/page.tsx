import { Suspense } from "react";
import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeadline } from "@/components/page-headline";
import prisma from "@/lib/prisma";
import { userHasPermission } from "@/lib/permissions";
import { normalizeDepartment } from "@/lib/work-log-access";
import { AdminLogsClient } from "./admin-logs-client";

export default async function AdminLogsPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, department: true, permissions: true },
  });
  const role = me?.role ?? session.user.role ?? "USER";
  const isExecutive = role === "EXECUTIVE" || role === "ADMIN";
  const canLogs =
    isExecutive ||
    userHasPermission({ role, permissions: me?.permissions ?? null }, "admin_logs");
  if (!canLogs) redirect("/dashboard");

  let employees = await prisma.user.findMany({
    where: {},
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      position: true,
      role: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  /** 팀장·admin_logs 권한(임원 제외): 같은 부서(팀) 사원·팀장만 목록에 표시. 임원·관리자 제외. */
  if (!isExecutive && canLogs) {
    const dept = normalizeDepartment(me?.department);
    employees = employees.filter((e) => {
      if (e.role === "EXECUTIVE" // Prisma enum
        || e.role === "ADMIN") return false;
      if (!dept) return e.id === session.user.id;
      return normalizeDepartment(e.department) === dept;
    });
  }

  const headlineDesc = !isExecutive && canLogs
    ? "같은 부서(팀) 소속 직원만 표시됩니다. 본인 프로필에 부서가 없으면 본인만 보이거나 목록이 비어 있을 수 있습니다."
    : "직원을 선택하고 날짜를 지정하면 해당 날짜의 자동 생성된 Daily Report를 볼 수 있습니다.";

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeadline title="Daily Report 조회" description={headlineDesc} />
      <Suspense fallback={<p className="text-muted-foreground text-sm">불러오는 중...</p>}>
        <AdminLogsClient
          employees={employees.map((e: any) => ({
            id: e?.id ?? "",
            name: e?.name ?? "",
            email: e?.email ?? "",
            department: e?.department ?? "",
            position: e?.position ?? "",
            role: e?.role ?? "",
          }))}
        />
      </Suspense>
    </div>
  );
}
