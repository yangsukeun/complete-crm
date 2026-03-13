import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import dynamic from "next/dynamic";
import { LoadingFallback } from "@/components/loading-fallback";

const ChatPageClient = dynamic(() => import("./chat-page-client").then((m) => ({ default: m.ChatPageClient })), {
  loading: () => <LoadingFallback label="채팅 불러오는 중..." />,
  ssr: false,
});

export default async function ChatPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");

  const cookieStore = await cookies();
  const appMode = cookieStore.get("app_mode")?.value;
  if (appMode !== "company") redirect("/choose-mode");

  return <ChatPageClient />;
}
