import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canViewCsOrg } from "@/lib/cs-client-access";
import { homePathForUser } from "@/lib/org-access";
import { parseYearMonth } from "@/lib/cs-org-month";
import { CsScreen } from "@/components/cs-screen";
import { CsOrgMonthClient } from "./cs-org-month-client";

export default async function CsOrgMonthPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, department: true },
  });
  if (!me || !canViewCsOrg(me)) {
    redirect(homePathForUser({ role: me?.role ?? session.user.role, department: me?.department ?? session.user.department }));
  }
  const q = await searchParams;
  return (
    <CsScreen>
      <CsOrgMonthClient initialYm={parseYearMonth(q.ym)} />
    </CsScreen>
  );
}
