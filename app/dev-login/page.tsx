"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 개발 전용 우회 로그인.
 * 첫 번째 관리자 비밀번호를 dev1234로 맞춘 뒤, 해당 계정으로 로그인 요청을 보냅니다.
 */
export default function DevLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  async function handleBypass() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/dev-bypass", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "실패");
        setLoading(false);
        return;
      }
      const { email, password } = data as { email?: string; password?: string };
      if (!email || !password) {
        setError("응답 형식 오류");
        setLoading(false);
        return;
      }
      setLoading(false);
      setCredentials({ email, password });
    } catch {
      setError("요청 실패");
      setLoading(false);
    }
  }

  function handleSubmitLogin() {
    if (!credentials) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/auth/login";
    form.style.display = "none";
    const add = (name: string, value: string) => {
      const input = document.createElement("input");
      input.name = name;
      input.value = value;
      input.type = "hidden";
      form.appendChild(input);
    };
    add("email", credentials.email);
    add("password", credentials.password);
    add("callbackUrl", "/choose-mode");
    document.body.appendChild(form);
    form.submit();
  }

  if (process.env.NODE_ENV !== "development") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-muted-foreground">개발 환경에서만 사용할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-lg font-semibold">개발용 우회 로그인</h1>
      <p className="text-muted-foreground text-center text-sm">
        첫 번째 관리자 비밀번호를 dev1234로 맞춘 뒤 해당 계정으로 로그인합니다.
        <br />
        자동 로그인이 실패하면 아래 이메일과 비밀번호 <strong>dev1234</strong>로 로그인 화면에서 직접 입력하세요.
      </p>
      {error && (
        <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {credentials && (
        <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
          이메일: <strong>{credentials.email}</strong> / 비밀번호: <strong>{credentials.password}</strong>
          <br />
          자동 로그인이 실패하면 로그인 화면에서 위 값을 입력하세요.
        </p>
      )}
      {!credentials ? (
        <button
          type="button"
          onClick={handleBypass}
          disabled={loading}
          className="rounded bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "처리 중..." : "1. 비밀번호 맞추기 (dev1234)"}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSubmitLogin}
          className="rounded bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
        >
          2. 위 계정으로 로그인 시도
        </button>
      )}
      <button
        type="button"
        onClick={() => router.push("/login")}
        className="text-muted-foreground text-sm underline"
      >
        일반 로그인으로
      </button>
    </div>
  );
}
