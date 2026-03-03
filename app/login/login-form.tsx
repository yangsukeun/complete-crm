"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
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

const isDev = process.env.NODE_ENV === "development";

function LoginFormInner() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/choose-mode";
  const urlError = searchParams.get("error");
  const [loading, setLoading] = useState(false);

  const displayError =
    urlError === "CredentialsSignin"
      ? "이메일 또는 비밀번호가 올바르지 않습니다."
      : urlError
        ? decodeURIComponent(String(urlError))
        : "";

  // 개발: 이메일만 입력 후 로그인 (비밀번호 없음)
  if (isDev) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-semibold">COMPLETE CRM</CardTitle>
            <CardDescription>개발 모드: 이메일만 입력하면 로그인됩니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {displayError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {displayError}
              </p>
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
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button
              type="button"
              className="w-full"
              disabled={loading}
              onClick={() => {
                const email = (document.getElementById("email") as HTMLInputElement)?.value?.trim();
                if (!email) {
                  alert("이메일을 입력해 주세요.");
                  return;
                }
                setLoading(true);
                window.location.href = `/api/auth/dev-email-login?email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
              }}
            >
              {loading ? "로그인 중..." : "로그인"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              계정이 없으면 이메일 입력 후 로그인 시 자동 생성됩니다.{" "}
              <Link href="/signup" className="text-primary underline hover:no-underline">회원가입</Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // 프로덕션: NextAuth signIn에 이메일·비밀번호 직접 전달 (서버리스에서 메모리 토큰 미동작 방지)
  async function handleProductionSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = e.currentTarget;
    const email = (form.querySelector('[name="email"]') as HTMLInputElement)?.value?.trim() ?? "";
    const password = (form.querySelector('[name="password"]') as HTMLInputElement)?.value ?? "";
    if (!email || !password) {
      setLoading(false);
      return;
    }
    try {
      const res = await signIn("credentials", {
        email: email.toLowerCase(),
        password,
        callbackUrl,
        redirect: false,
      });
      if (res?.error) {
        setLoading(false);
        window.location.href = `/login?error=CredentialsSignin&callbackUrl=${encodeURIComponent(callbackUrl)}`;
        return;
      }
      if (res?.url) {
        window.location.href = res.url;
        return;
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-semibold">COMPLETE CRM</CardTitle>
          <CardDescription>이메일과 비밀번호로 로그인하세요.</CardDescription>
        </CardHeader>
        <form onSubmit={handleProductionSubmit}>
          <CardContent className="space-y-4">
            {displayError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {displayError}
              </p>
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
