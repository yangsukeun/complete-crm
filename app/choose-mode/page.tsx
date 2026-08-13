import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { homePathForOrg, resolveOrgUnit } from "@/lib/org-access";
import { ChooseModeClient } from "./choose-mode-client";

export default async function ChooseModePage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  let department = session.user.department ?? null;
  if (department == null || department === "") {
    const row = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { department: true },
    });
    department = row?.department ?? null;
  }

  const org = resolveOrgUnit({ role: session.user.role, department });
  if (org !== "HQ") {
    redirect(homePathForOrg(org));
  }

  return <ChooseModeClient homePath="/dashboard" />;
}
