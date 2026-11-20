"use server";

import { signIn } from "@/auth";

import { crmCallbackPath, startsCompanyMode } from "@/lib/crm-login-landing";
import { setCompanyModeCookie } from "@/lib/crm-login-mode";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function loginWithCredentials(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const url = crmCallbackPath(formData.get("callbackUrl"));

  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return { error: "이메일과 비밀번호를 입력하세요." };
  }

  try {
    const destination = await signIn("credentials", {
      email: email.trim(),
      password: password.trim(),
      redirectTo: url,
      redirect: false,
    });
    if (typeof destination !== "string") throw new Error("Missing login redirect");
    if (startsCompanyMode(url)) setCompanyModeCookie(await cookies(), process.env.NODE_ENV === "production");
  } catch {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  redirect(url);
}
