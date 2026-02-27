import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AdminEmployeesClient } from "./admin-employees-client";
import { EmployeeHeaderActions } from "./employee-header-actions";
import { PageHeadline } from "@/components/page-headline";
import prisma from "@/lib/prisma";

type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  position: string | null;
  bankAccount: string | null;
  address: string | null;
  workPhone: string | null;
  workEmail: string | null;
  joinDate: Date;
  currentProjectId: string | null;
  permissions: string | null;
};

export default async function AdminEmployeesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") redirect("/dashboard");

  const rows = await prisma.$queryRaw<EmployeeRow[]>`
    SELECT id, name, email, role, department, position, bankAccount, address, workPhone, workEmail, joinDate, currentProjectId, permissions
    FROM User
    WHERE role IN ('USER', 'TEAM_LEAD')
    ORDER BY joinDate DESC
  `;

  const projectIds = [...new Set(rows.map((r: any) => r.currentProjectId).filter(Boolean))] as string[];
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

      const employees = rows.map((e: any) => {
        const proj = projects.find((p: any) => p.id === e.currentProjectId);
    return {
      id: e.id,
      name: e.name,
      email: e.email,
      role: e.role,
      department: e.department ?? "",
      position: e.position ?? "",
      bankAccount: e.bankAccount ?? "",
      address: e.address ?? "",
      workPhone: e.workPhone ?? "",
      workEmail: e.workEmail ?? "",
      currentProject: proj ? { id: proj.id, name: proj.name, brand: proj.brand } : null,
      joinDate: e.joinDate instanceof Date ? e.joinDate.toISOString().slice(0, 10) : String(e.joinDate).slice(0, 10),
      permissions: e.permissions ?? null,
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
        employees={employees}
      />
    </div>
  );
}
