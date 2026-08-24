import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { AdminEmployeesClient, type Employee } from "./admin-employees-client";
import { EmployeeHeaderActions } from "./employee-header-actions";
import { PageHeadline } from "@/components/page-headline";
import prisma from "@/lib/prisma";
import { getEmployeeManagerContext } from "@/lib/employee-admin-access-db";

export default async function AdminEmployeesPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  const manager = await getEmployeeManagerContext(session.user.id);
  if (!manager?.ok) redirect("/dashboard");

  // 직원(USER, TEAM_LEAD) + 관리자(ADMIN, EXECUTIVE) 모두 표시 (DB에 있는 계정이 목록에 보이도록)
  const rows = await prisma.user.findMany({
    where: {},
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      position: true,
      bankAccount: true,
      address: true,
      workPhone: true,
      workEmail: true,
      joinDate: true,
      currentProjectId: true,
      permissions: true,
    },
    orderBy: { joinDate: "desc" },
  });

  type Row = (typeof rows)[number];
  const projectIds = [...new Set(rows.map((r: Row) => r.currentProjectId).filter(Boolean))] as string[];
  const projects =
    projectIds.length > 0
      ? await prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: {
            id: true,
            name: true,
            brand: { select: { name: true } },
          },
        })
      : [];

  // Prisma가 project.brand를 string | { name } 등으로 추론해 빌드 오류가 나므로, brand만 별도 추출 후 currentProject를 순수 객체로 구성하고 전달 시 단언
  const employees = rows.map((e: Row) => {
    const proj = projects.find((p) => p.id === e.currentProjectId);
    const brand: { name: string } | null =
      proj && typeof (proj as { brand?: unknown }).brand === "object" && proj.brand !== null && "name" in proj.brand
        ? { name: String((proj.brand as { name: string }).name) }
        : null;
    const currentProject: { id: string; name: string; brand: { name: string } | null } | null = proj
      ? { id: String(proj.id), name: String(proj.name), brand }
      : null;
    return {
      id: e?.id ?? "",
      name: e?.name ?? "",
      email: e?.email ?? "",
      role: e?.role ?? "",
      department: e?.department ?? "",
      position: e?.position ?? "",
      bankAccount: e?.bankAccount ?? "",
      address: e?.address ?? undefined,
      workPhone: e?.workPhone ?? undefined,
      workEmail: e?.workEmail ?? undefined,
      currentProject,
      joinDate: e?.joinDate != null ? (e.joinDate instanceof Date ? e.joinDate.toISOString().slice(0, 10) : String(e.joinDate).slice(0, 10)) : "",
      permissions: e?.permissions ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeadline
          title="직원 관리"
          description="직원 계정을 생성하거나, 입사일·부서·역할(직책에 따른 기능)을 수정할 수 있습니다. 역할로 직원/팀장 기능을 부여합니다."
        />
        <EmployeeHeaderActions />
      </div>
      <AdminEmployeesClient
        employees={employees as Employee[]}
        managerKind={manager.kind}
      />
    </div>
  );
}
