import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canViewCsClients } from "@/lib/cs-client-access";
import { homePathForUser } from "@/lib/org-access";
import { CsClientsClient } from "./cs-clients-client";

export default async function CsClientsPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, department: true },
  });
  if (!me || !canViewCsClients(me)) {
    redirect(homePathForUser({ role: me?.role ?? session.user.role, department: me?.department ?? session.user.department }));
  }
  return <CsClientsClient />;
}
