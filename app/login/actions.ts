"use server";

import { signIn } from "@/auth";

const DEFAULT_CALLBACK = "/choose-mode";

export async function loginWithCredentials(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const callbackUrl = (formData.get("callbackUrl") as string) || DEFAULT_CALLBACK;
  const url = callbackUrl.startsWith("/") ? callbackUrl : DEFAULT_CALLBACK;

  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return { error: "이메일과 비밀번호를 입력하세요." };
  }

  try {
    await signIn("credentials", {
      email: email.trim(),
      password: password.trim(),
      callbackUrl: url,
      redirect: true,
    });
  } catch (err: unknown) {
    const e = err as { type?: string; digest?: string };
    if (e?.type === "redirect" || e?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  return { error: null };
}
