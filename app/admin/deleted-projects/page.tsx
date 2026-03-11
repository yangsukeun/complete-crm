import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { DeletedProjectsClient } from "./deleted-projects-client";

export default async function AdminDeletedProjectsPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") redirect("/dashboard");

  return <DeletedProjectsClient />;
}
