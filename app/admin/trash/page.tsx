import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { TrashClient } from "./trash-client";

export default async function AdminTrashPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") redirect("/dashboard");

  return <TrashClient />;
}
