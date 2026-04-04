import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authWithTimeout } from "@/lib/auth-safe";
import { AiHubClient } from "./ai-hub-client";

export const metadata: Metadata = {
  title: "AI 허브",
  description: "용도별 AI 에이전트",
};

export default async function AiHubPage() {
  const session = await authWithTimeout();
  if (!session?.user) redirect("/login");

  return <AiHubClient />;
}
