import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AdminProjectsClient } from "./projects-client";

export default async function AdminProjectsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") redirect("/dashboard");

  return <AdminProjectsClient />;
}

