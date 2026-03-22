import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authWithTimeout } from "@/lib/auth-safe";
import { AiSecretaryClient } from "./ai-secretary-client";

export const metadata: Metadata = {
  title: "AI 비서",
  description: "역할별 맥락으로 업무·일정을 도와드립니다.",
};

export default async function AiSecretaryPage() {
  const session = await authWithTimeout();
  if (!session?.user) redirect("/login");

  return <AiSecretaryClient />;
}
