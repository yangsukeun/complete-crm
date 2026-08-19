import Link from "next/link";
import { redirect } from "next/navigation";
import { Warehouse } from "lucide-react";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canAccessCsLounge } from "@/lib/cs-lounge-access";
import { canManageCsClients } from "@/lib/cs-client-access";
import { homePathForUser } from "@/lib/org-access";
import { buildCsOrgForest } from "@/lib/cs-org";
import { loadCsOrgPeople } from "@/lib/cs-org-data";
import { PageHeadline } from "@/components/page-headline";
import { CsScreen } from "@/components/cs-screen";
import { Button } from "@/components/ui/button";
import { CsOrgPyramid } from "./cs-org-tree";

export default async function CsOrgPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, department: true },
  });
  if (!me || !canAccessCsLounge(me)) {
    redirect(homePathForUser({ role: me?.role ?? session.user.role, department: me?.department ?? session.user.department }));
  }

  const { people, explicit } = await loadCsOrgPeople();
  const { roots, unassigned } = buildCsOrgForest(people, explicit);
  const canManage = canManageCsClients(me);

  return (
    <CsScreen>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeadline
          title="CS 조직도"
          description="센터장이 맨 위이고, 팀장·부팀장 밑으로 사원이 붙습니다. 담당 업체도 함께 보입니다."
        />
        {canManage ? (
          <Button asChild variant="outline">
            <Link href="/cs-org/settings">
              <Warehouse className="size-4" />
              설정 창고
            </Link>
          </Button>
        ) : null}
      </div>
      <CsOrgPyramid roots={roots} unassigned={unassigned} />
    </CsScreen>
  );
}
