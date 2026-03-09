"use client";

import { useState } from "react";
import Link from "next/link";
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

/** API 라우트로 비밀번호 재설정 (Vercel 서버리스에서 Server Action보다 안정적) */
async function resetPasswordViaApi(body: {
  email: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ error?: string }> {
  const res = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  const errMsg = (data as { error?: string }).error;
  if (!res.ok) {
    if (res.status === 401) {
      return {
        error:
          "접근이 거부되었습니다(401). Vercel 프로젝트 설정 → Deployment Protection에서 비밀번호 보호를 끄고 다시 시도하세요.",
      };
    }
    return { error: errMsg ?? "요청에 실패했습니다." };
  }
  return data;
}

export default function ResetPasswordPage() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const form = e.currentTarget;
      const email = (form.querySelector('[name="email"]') as HTMLInputElement)?.value?.trim() ?? "";
      const newPassword = (form.querySelector('[name="newPassword"]') as HTMLInputElement)?.value ?? "";
      const confirmPassword = (form.querySelector('[name="confirmPassword"]') as HTMLInputElement)?.value ?? "";
      const result = await resetPasswordViaApi({ email, newPassword, confirmPassword });
      if (result?.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setSuccess(true);
    } catch {
      setError("요청 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">비밀번호가 재설정되었습니다</CardTitle>
            <CardDescription className="text-center">
              아래 로그인 링크에서 새 비밀번호로 로그인하세요.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/login">로그인 화면으로</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-semibold">비밀번호 재설정</CardTitle>
          <CardDescription>
            가입한 이메일과 새 비밀번호를 입력하세요. (4자 이상)
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
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
              <Label htmlFor="newPassword">새 비밀번호</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                placeholder="4자 이상"
                autoComplete="new-password"
                required
                minLength={4}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">비밀번호 확인</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="같은 비밀번호 다시 입력"
                autoComplete="new-password"
                required
                minLength={4}
                disabled={loading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "처리 중..." : "비밀번호 재설정"}
            </Button>
            <Button variant="ghost" asChild className="w-full" disabled={loading}>
              <Link href="/login">로그인 화면으로 돌아가기</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
