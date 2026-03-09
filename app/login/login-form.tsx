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
  const [submitError, setSubmitError] = useState<string>("");

  const displayError =
    urlError === "CredentialsSignin"
      ? "이메일 또는 비밀번호가 올바르지 않습니다."
      :     urlError
        ? decodeURIComponent(String(urlError))
        : submitError || "";
  const isCredentialError = urlError === "CredentialsSignin" || submitError.includes("이메일 또는 비밀번호");

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
      const res = await signIn("credentials", {
        email: email.toLowerCase(),
        password,
        callbackUrl,
        redirect: false,
      });
      // NextAuth v5: 반환값이 객체가 아니라 URL 문자열일 수 있음
      const resObj = typeof res === "string" ? { url: res, error: undefined } : res ?? {};
      const successUrl = resObj.url ?? (typeof res === "string" ? res : null);
      const err = resObj.error;

      if (err) {
        setLoading(false);
        setSubmitError("이메일 또는 비밀번호가 올바르지 않습니다.");
        return;
      }
      if (successUrl) {
        window.location.href = successUrl;
        return;
      }
      // url도 error도 없으면 callbackUrl로 이동 시도 (세션이 설정됐을 수 있음)
      setLoading(false);
      window.location.href = callbackUrl;
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
        <form onSubmit={handleProductionSubmit}>
          <CardContent className="space-y-4">
            {displayError && (
              <div className="space-y-1.5 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <p>{displayError}</p>
                {isCredentialError && (
                  <p className="text-muted-foreground">
                    개발 모드에서 이메일만으로 만든 계정은 비밀번호를 모릅니다.{" "}
                    <Link href="/login/reset-password" className="font-medium text-foreground underline hover:no-underline">
                      비밀번호 재설정
                    </Link>
                    에서 가입한 이메일과 새 비밀번호를 입력한 뒤 다시 로그인하세요.
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
