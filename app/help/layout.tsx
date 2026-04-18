import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { HelpShell } from "./components/help-shell";

export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  const session = await getAppSession();
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "/help";

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
  }

  const isAdmin = session.user.role === "ADMIN";

  return <HelpShell isAdmin={isAdmin}>{children}</HelpShell>;
}
