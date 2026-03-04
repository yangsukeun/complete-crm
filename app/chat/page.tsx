import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ChatPageClient } from "./chat-page-client";

export default async function ChatPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");

  const cookieStore = await cookies();
  const appMode = cookieStore.get("app_mode")?.value;
  if (appMode !== "company") redirect("/choose-mode");

  return <ChatPageClient />;
}
