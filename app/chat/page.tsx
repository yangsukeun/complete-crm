import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authWithTimeout } from "@/lib/auth-safe";
import { resolveAppModeForUser } from "@/lib/app-mode-server";
import { ChatClientWrapper } from "./chat-client-wrapper";

export default async function ChatPage() {
  const session = await authWithTimeout();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const appMode = await resolveAppModeForUser(session.user.id, cookieStore);
  if (appMode !== "company") redirect("/choose-mode");

  return <ChatClientWrapper />;
}
