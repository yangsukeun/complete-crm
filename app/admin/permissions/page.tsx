import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { PageHeadline } from "@/components/page-headline";
import prisma from "@/lib/prisma";
import { AdminPermissionsClient } from "./admin-permissions-client";

export default async function AdminPermissionsPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") redirect("/dashboard");

  const [positions, users] = await Promise.all([
    prisma.position.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sortOrder: true, permissions: true },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
        permissions: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeadline
        title="기능 권한"
        description="직책(직급)별 기본 템플릿과 계정별 권한을 설정합니다. 개별 설정이 직책 템플릿보다 우선합니다."
      />
      <AdminPermissionsClient
        initialPositions={positions.map((p) => ({
          id: p.id,
          name: p.name,
          sortOrder: p.sortOrder,
          permissions: p.permissions ?? null,
        }))}
        initialUsers={users.map((u) => ({
          id: u.id,
          name: u.name ?? "",
          email: u.email ?? "",
          role: u.role,
          position: u.position ?? "",
          permissions: u.permissions ?? null,
        }))}
      />
    </div>
  );
}
