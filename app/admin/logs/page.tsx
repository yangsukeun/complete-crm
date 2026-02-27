import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeadline } from "@/components/page-headline";
import prisma from "@/lib/prisma";
import { AdminLogsClient } from "./admin-logs-client";

export default async function AdminLogsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") redirect("/dashboard");

  const employees = await prisma.user.findMany({
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

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeadline
        title="업무일지 조회"
        description="직원을 선택하고 날짜를 지정하면 해당 날짜의 자동 생성된 업무일지를 볼 수 있습니다."
      />
      <AdminLogsClient
      employees={employees.map((e: any) => ({
        
          id: e.id,
          name: e.name,
          email: e.email,
          department: e.department ?? "",
          position: e.position ?? "",
          role: e.role,
        }))}
      />
    </div>
  );
}
