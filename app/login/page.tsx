"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
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

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "이메일 또는 비밀번호가 올바르지 않습니다.",
  Default: "로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/choose-mode";
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const displayError = error || (urlError ? ERROR_MESSAGES[urlError] ?? ERROR_MESSAGES.Default : "");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res: any = await signIn("credentials", {
        email,
        password,
        callbackUrl: callbackUrl.startsWith("/") ? callbackUrl : "/choose-mode",
        redirect: true,
      } as any);

      if (res?.error) {
        setError(ERROR_MESSAGES[res.error] ?? ERROR_MESSAGES.Default);
        setLoading(false);
        return;
      }
      if (res?.ok === false && res?.status !== 200) {
        setError(ERROR_MESSAGES.Default);
        setLoading(false);
        return;
      }
    } catch {
      setError("로그인 중 오류가 발생했습니다.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-semibold">
            COMPLETE CRM
          </CardTitle>
          <CardDescription>
            이메일과 비밀번호로 로그인하세요.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
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
                value={email}
                onChange={(e: any) => setEmail(e.target.value)}
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
                value={password}
                onChange={(e: any) => setPassword(e.target.value)}
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
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted/30">
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
