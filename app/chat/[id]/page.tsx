import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authWithTimeout } from "@/lib/auth-safe";
import { resolveAppModeForUser } from "@/lib/app-mode-server";
import { ChatClientWrapper } from "../chat-client-wrapper";

type Props = { params: Promise<{ id: string }> };

export default async function ChatWithIdPage({ params }: Props) {
  const session = await authWithTimeout();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const appMode = await resolveAppModeForUser(session.user.id, cookieStore);
  if (appMode !== "company") redirect("/choose-mode");

  const { id } = await params;
  return <ChatClientWrapper initialChatId={id} />;
}
