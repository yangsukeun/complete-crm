import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { ProfilePageClient } from "./profile-page-client";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  try {
    const session = await getAppSession();
    if (!session?.user) redirect("/login");
    const { new: isNew } = await searchParams;
    return (
      <ProfilePageClient
        isAdmin={session.user.role === "EXECUTIVE" || session.user.role === "ADMIN"}
        isNewUser={isNew === "1"}
      />
    );
  } catch {
    redirect("/login");
  }
}
