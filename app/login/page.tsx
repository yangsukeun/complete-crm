import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { crmCallbackPath } from "@/lib/crm-login-landing";
import LoginForm from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  // A stale disabled session must not bounce between the login screen and home.
  if (session?.user && params.error !== "AccountUnavailable") {
    redirect(crmCallbackPath(params.callbackUrl));
  }
  return <LoginForm />;
}
