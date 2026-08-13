import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canAccessCsLounge } from "@/lib/cs-lounge-access";
import { homePathForUser } from "@/lib/org-access";
import { CsLoungeClient } from "./cs-lounge-client";

export default async function CsLoungePage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, department: true },
  });
  if (!me || !canAccessCsLounge(me)) {
    redirect(homePathForUser({ role: me?.role ?? session.user.role, department: me?.department ?? session.user.department }));
  }

  return <CsLoungeClient />;
}
