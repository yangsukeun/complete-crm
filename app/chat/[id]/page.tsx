import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authWithTimeout } from "@/lib/auth-safe";
import { ChatClientWrapper } from "../chat-client-wrapper";

type Props = { params: Promise<{ id: string }> };

export default async function ChatWithIdPage({ params }: Props) {
  const session = await authWithTimeout();
  if (!session?.user) redirect("/login");

  const cookieStore = await cookies();
  const appMode = cookieStore.get("app_mode")?.value;
  if (appMode !== "company") redirect("/choose-mode");

  const { id } = await params;
  return <ChatClientWrapper initialChatId={id} />;
}
