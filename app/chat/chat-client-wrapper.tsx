"use client";

import dynamic from "next/dynamic";
import { LoadingFallback } from "@/components/loading-fallback";

const ChatPageClient = dynamic(
  () => import("./chat-page-client").then((mod) => ({ default: mod.ChatPageClient })),
  {
    loading: () => <LoadingFallback label="채팅 불러오는 중..." />,
    ssr: false,
  }
);

export function ChatClientWrapper() {
  return <ChatPageClient />;
}
