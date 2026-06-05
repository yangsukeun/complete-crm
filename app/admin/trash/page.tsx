import { getAppSession } from "@/auth";
import { redirect } from "next/navigation";
import { isMasterSession } from "@/lib/master-account";
import { TrashClient } from "./trash-client";

export default async function AdminTrashPage() {
  const session = await getAppSession();
  if (!session?.user) redirect("/login");
  // 휴지통(전체 삭제 항목·감사용)은 마스터 계정 전용
  if (!isMasterSession(session)) redirect("/dashboard");

  return <TrashClient />;
}
