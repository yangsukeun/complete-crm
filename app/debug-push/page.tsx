import { getAppSession } from "@/auth";
import { notFound, redirect } from "next/navigation";
import { DebugPushClient } from "./debug-push-client";

/**
 * OneSignal 푸시 등록 진단용.
 * ADMIN / EXECUTIVE만 접근 가능 (미등록 임원 등록 지원).
 */
export default async function DebugPushPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");

  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN" && role !== "EXECUTIVE") notFound();

  return <DebugPushClient />;
}
