"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

function NotificationEntryBannerInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const show =
    pathname !== "/login" &&
    !pathname.startsWith("/signup") &&
    searchParams.get("from") === "notification";

  if (!show) return null;

  const dismiss = () => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("from");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  };

  return (
    <div
      role="status"
      className="border-b border-primary/20 bg-primary/10 px-4 py-2 text-center text-sm text-foreground"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-3">
        <span>알림을 눌러 이 화면으로 들어왔습니다.</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2"
          onClick={dismiss}
          aria-label="배너 닫기"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** `?from=notification` (푸시·원시그널 딥링크)일 때 상단 안내 */
export function NotificationEntryBanner() {
  return (
    <Suspense fallback={null}>
      <NotificationEntryBannerInner />
    </Suspense>
  );
}
