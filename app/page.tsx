import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { crmLandingForUser } from "@/lib/crm-login-landing";

export default async function HomePage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, department: true, accountDisabled: true },
  });
  if (!user || user.accountDisabled) redirect("/login?error=AccountUnavailable");
  redirect(crmLandingForUser(user));
}
