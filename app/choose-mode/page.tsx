import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { homePathForOrg, resolveOrgUnit } from "@/lib/org-access";
import { ChooseModeClient } from "./choose-mode-client";

export default async function ChooseModePage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, department: true, accountDisabled: true },
  });
  if (!me || me.accountDisabled) redirect("/login");
  const org = resolveOrgUnit(me);
  if (org !== "HQ") {
    redirect(homePathForOrg(org));
  }

  return <ChooseModeClient homePath="/dashboard" />;
}
