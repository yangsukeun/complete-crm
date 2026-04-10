import { redirect } from "next/navigation";
import { auth } from "@/auth";
import LoginForm from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  // 이미 로그인된 상태에서 알림·딥링크 클릭으로 /login?callbackUrl=... 에 오면 바로 이동
  const session = await auth();
  if (session?.user) {
    const params = await searchParams;
    const raw = params.callbackUrl;
    const dest =
      typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("://")
        ? raw
        : "/choose-mode";
    redirect(dest);
  }
  return <LoginForm />;
}
