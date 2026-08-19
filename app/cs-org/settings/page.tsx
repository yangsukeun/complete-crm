import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canManageCsClients } from "@/lib/cs-client-access";
import { CsScreen } from "@/components/cs-screen";
import { CsOrgSettingsClient } from "./cs-org-settings-client";

export default async function CsOrgSettingsPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, department: true },
  });
  if (!me || !canManageCsClients(me)) {
    redirect("/cs-org");
  }

  return (
    <CsScreen>
      <CsOrgSettingsClient />
    </CsScreen>
  );
}
