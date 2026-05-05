"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

function safeInternalCallbackUrl(raw: string | null): string {
  if (!raw || typeof raw !== "string") return "/choose-mode";
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("://")) return raw;
  return "/choose-mode";
}

function LoginFormInner() {
  const searchParams = useSearchParams();
  const callbackUrl = safeInternalCallbackUrl(searchParams.get("callbackUrl"));
  const urlError = searchParams.get("error");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");

  const displayError =
    urlError === "CredentialsSignin"
      ? "이메일 또는 비밀번호가 올바르지 않습니다."
      : urlError === "AccountDisabled"
        ? "비활성화된 계정입니다. 퇴사 처리 등으로 접속이 차단된 경우 관리자에게 문의하세요."
        : urlError
          ? decodeURIComponent(String(urlError))
          : submitError || "";
  const isCredentialError =
    (urlError === "CredentialsSignin" || submitError.includes("이메일 또는 비밀번호")) && urlError !== "AccountDisabled";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError("");
    setLoading(true);
    const form = e.currentTarget;
    const email = (form.querySelector('[name="email"]') as HTMLInputElement)?.value?.trim() ?? "";
    const password = (form.querySelector('[name="password"]') as HTMLInputElement)?.value ?? "";
    if (!email || !password) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email: email.toLowerCase(),
          password,
          callbackUrl,
        }),
        credentials: "include",
        redirect: "follow",
      });
      const finalUrl = res.url;
      if (finalUrl.includes("/login")) {
        const u = new URL(finalUrl, window.location.origin);
        const err = u.searchParams.get("error");
        setLoading(false);
        if (err === "AccountDisabled") {
          setSubmitError(
            "비활성화된 계정입니다. 퇴사 처리 등으로 접속이 차단된 경우 관리자에게 문의하세요."
          );
          return;
        }
        setSubmitError("이메일 또는 비밀번호가 올바르지 않습니다.");
        return;
      }
      window.location.assign(finalUrl);
    } catch (err) {
      setLoading(false);
      setSubmitError("로그인 요청에 실패했습니다. 네트워크와 서버를 확인한 뒤 다시 시도해 주세요.");
      console.error("[login]", err);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-semibold">COMPLETE CRM</CardTitle>
          <CardDescription>이메일과 비밀번호로 로그인하세요.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {displayError && (
              <div className="space-y-1.5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <p>{displayError}</p>
                {isCredentialError && (
                  <p className="text-muted-foreground">
                    비밀번호를 잊었다면{" "}
                    <Link href="/login/reset-password" className="font-medium text-foreground underline hover:no-underline">
                      비밀번호 재설정
                    </Link>
                    을 이용하세요.
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "로그인 중..." : "로그인"}
            </Button>
            {loading && (
              <p className="text-muted-foreground text-center text-xs">
                서버 응답이 느릴 수 있습니다. 잠시만 기다려 주세요.
              </p>
            )}
            <p className="text-center text-sm text-muted-foreground">
              계정이 없으신가요?{" "}
              <Link href="/signup" className="text-primary underline hover:no-underline">
                회원가입
              </Link>
            </p>
            <p className="text-center text-sm text-muted-foreground">
              비밀번호를 잊으셨나요?{" "}
              <Link href="/login/reset-password" className="text-primary font-medium underline hover:no-underline">
                비밀번호 재설정
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function LoginForm() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted/30">
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      }
    >
      <LoginFormInner />
    </Suspense>
  );
}
