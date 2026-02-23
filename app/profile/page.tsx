import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ProfilePageClient } from "./profile-page-client";

export default async function ProfilePage() {
  try {
    const session = await auth();
    if (!session?.user) redirect("/login");
    return <ProfilePageClient isAdmin={session.user.role === "EXECUTIVE" || session.user.role === "ADMIN"} />;
  } catch {
    redirect("/login");
  }
}
