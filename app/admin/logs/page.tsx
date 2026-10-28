import { Suspense } from "react";
import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeadline } from "@/components/page-headline";
import prisma from "@/lib/prisma";
import { resolveEffectivePermissionsJson } from "@/lib/permissions-resolve";
import { canViewOthersDailyWorkLog, hasDailyReportMenuAccess } from "@/lib/work-log-access";
import { AdminLogsClient } from "./admin-logs-client";

export default async function AdminLogsPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, department: true, permissions: true, accountDisabled:true },
  });
  const role = me?.role ?? session.user.role ?? "USER";
  const isExecutive = role === "EXECUTIVE" || role === "ADMIN";
  const permsJson = await resolveEffectivePermissionsJson(session.user.id).catch(
    () => me?.permissions ?? null
  );
  const canLogs = !!me&&hasDailyReportMenuAccess({ ...me,role, permissions: permsJson });
  if (!canLogs) redirect("/dashboard");

  let employees = await prisma.user.findMany({
    where: {accountDisabled:false},
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

  /** 사원급·팀장급·다른 부서 권한을 병렬로 적용. 기본은 같은 팀도 비공개. */
  if (!isExecutive && canLogs) {
    employees = employees.filter((e) =>
      canViewOthersDailyWorkLog({
        viewerId: session.user.id,
        viewerRole: role,
        viewerDepartment: me?.department,
        viewerPermissions: permsJson,
        target: e,
      })
    );
  }

  const headlineDesc = !isExecutive && canLogs
    ? "사원급·팀장급·다른 부서 조회 권한이 겹치는 직원만 표시됩니다. 권한이 없으면 같은 팀 일지도 볼 수 없습니다."
    : "직원을 선택하고 날짜를 지정하면 해당 날짜의 자동 생성된 Daily Report를 볼 수 있습니다.";

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeadline title="Daily Report 조회" description={headlineDesc} />
      <Suspense fallback={<p className="text-muted-foreground text-sm">불러오는 중...</p>}>
        <AdminLogsClient
          employees={employees.map((e) => ({
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
