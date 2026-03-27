import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { getAppSession } from "@/auth";
import { userCanAccessProject } from "@/lib/project-access";
import { ProjectDetailClient } from "./project-detail-client";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">로그인이 필요합니다.</p>
      </div>
    );
  }

  const { id } = await params;
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, email: true, currentProjectId: true },
  });
  const allowed = await userCanAccessProject(session.user.id, id, {
    role: (me?.role ?? session.user.role) as string | undefined,
    email: me?.email ?? (session.user as { email?: string }).email,
    currentProjectId: me?.currentProjectId,
  });
  if (!allowed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <p className="text-muted-foreground text-center text-sm">이 프로젝트를 열람할 권한이 없습니다.</p>
      </div>
    );
  }

  const exists = await prisma.project.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!exists) notFound();

  return <ProjectDetailClient projectId={id} />;
}
