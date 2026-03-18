"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { AIAssistProvider } from "@/components/ai-assist-context";
import { AIAssistFloat } from "@/components/ai-assist-float";

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session?: Session | null;
}) {
  // session.user가 null이면 클라이언트에서 reading 'email' 등 null 참조 오류 방지
  const safeSession =
    session != null && session.user != null ? session : undefined;
  return (
    <SessionProvider
      basePath="/api/auth"
      session={safeSession ?? undefined}
      refetchInterval={0}
      refetchOnWindowFocus={false}
    >
      <AIAssistProvider>
        {children}
        {safeSession?.user && <AIAssistFloat />}
      </AIAssistProvider>
    </SessionProvider>
  );
}
