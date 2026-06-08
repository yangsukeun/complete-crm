"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function readHistoryIndex(): number {
  if (typeof window === "undefined") return 0;
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === "number" ? idx : 0;
}

/**
 * 브라우저 히스토리 기준 뒤로/앞으로 (Next.js App Router history.state.idx 활용)
 */
export function HistoryNavButtons({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const maxIndexRef = useRef(0);
  const [index, setIndex] = useState(0);

  const sync = useCallback(() => {
    const idx = readHistoryIndex();
    setIndex(idx);
    maxIndexRef.current = Math.max(maxIndexRef.current, idx);
  }, []);

  useEffect(() => {
    sync();
  }, [pathname, sync]);

  useEffect(() => {
    const onPopState = () => sync();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [sync]);

  const canGoBack = index > 0;
  const canGoForward = index < maxIndexRef.current;

  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role="navigation"
      aria-label="페이지 이동"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-gray-600 hover:text-gray-900"
        disabled={!canGoBack}
        title="뒤로"
        aria-label="뒤로"
        onClick={() => router.back()}
      >
        <ArrowLeft className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-gray-600 hover:text-gray-900"
        disabled={!canGoForward}
        title="앞으로"
        aria-label="앞으로"
        onClick={() => router.forward()}
      >
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
