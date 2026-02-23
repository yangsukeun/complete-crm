"use client";

import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, User } from "lucide-react";
import { useWorkspaceStore, modeToWorkspace } from "@/store/workspace-store";

const COOKIE_NAME = "app_mode";

function setMode(mode: "company" | "personal") {
  document.cookie = `${COOKIE_NAME}=${mode};path=/;max-age=${60 * 60 * 24 * 365}`;
}

export default function ChooseModePage() {
  const router = useRouter();
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);

  const handleSelect = async (mode: "company" | "personal") => {
    setMode(mode);
    setWorkspace(modeToWorkspace(mode));
    try {
      await fetch("/api/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
    } catch {
      // ignore
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <Card
          className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
          onClick={() => handleSelect("company")}
        >
          <CardHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="size-6 text-primary" />
            </div>
            <CardTitle>회사 모드</CardTitle>
            <CardDescription>
              연차·반차 신청, 출퇴근, 지시/자율 업무(스킬트리), 일정 공유, 직원 채팅을
              사용합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full">회사 모드로 들어가기</Button>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
          onClick={() => handleSelect("personal")}
        >
          <CardHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
              <User className="size-6 text-muted-foreground" />
            </div>
            <CardTitle>개인 모드</CardTitle>
            <CardDescription>
              내 일정과 개인 할 일만 간단히 관리합니다. 회사 기능은 숨겨집니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              개인 모드로 들어가기
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
