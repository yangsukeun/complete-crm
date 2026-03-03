import { redirect } from "next/navigation";

/**
 * NextAuth가 /login/error?... 로 보낼 때 우리 로그인 폼(/login)으로 보냄
 */
export default function LoginErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params?.error === "string" ? params.error : "";
  const url = error ? `/login?error=${encodeURIComponent(error)}` : "/login";
  redirect(url);
}
