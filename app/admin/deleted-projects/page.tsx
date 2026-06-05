import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { isMasterSession } from "@/lib/master-account";

export default async function AdminDeletedProjectsPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  if (!isMasterSession(session)) redirect("/dashboard");

  redirect("/admin/trash");
}
