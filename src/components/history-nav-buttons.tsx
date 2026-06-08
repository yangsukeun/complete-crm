"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STACK_KEY = "crm-nav-stack";
const INDEX_KEY = "crm-nav-index";

type NavState = { stack: string[]; index: number };

function readNavState(): NavState {
  if (typeof window === "undefined") return { stack: [], index: 0 };
  try {
    const stack = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]") as string[];
    const index = Number.parseInt(sessionStorage.getItem(INDEX_KEY) || "0", 10);
    return {
      stack: Array.isArray(stack) ? stack : [],
      index: Number.isFinite(index) ? index : 0,
    };
  } catch {
    return { stack: [], index: 0 };
  }
}

function writeNavState({ stack, index }: NavState) {
  sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
  sessionStorage.setItem(INDEX_KEY, String(index));
}

/**
 * 앱 내 페이지 이동 기록(sessionStorage)으로 뒤로/앞으로.
 * Next.js history.state.idx는 환경마다 없어서 자체 스택을 씁니다.
 */
export function HistoryNavButtons({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const syncingRef = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const syncFromStorage = useCallback(() => {
    const { stack, index } = readNavState();
    setCanGoBack(index > 0 && stack.length > 1);
    setCanGoForward(index >= 0 && index < stack.length - 1);
  }, []);

  useEffect(() => {
    if (!pathname || syncingRef.current) return;

    const { stack, index } = readNavState();
    if (stack[index] === pathname) {
      syncFromStorage();
      return;
    }

    const truncated = stack.slice(0, Math.max(0, index) + 1);
    if (truncated[truncated.length - 1] !== pathname) {
      truncated.push(pathname);
    }
    const nextIndex = truncated.length - 1;
    writeNavState({ stack: truncated, index: nextIndex });
    setCanGoBack(nextIndex > 0);
    setCanGoForward(false);
  }, [pathname, syncFromStorage]);

  const goBack = useCallback(() => {
    const { stack, index } = readNavState();
    if (index <= 0 || stack.length < 2) return;
    const nextIndex = index - 1;
    const target = stack[nextIndex];
    if (!target) return;
    syncingRef.current = true;
    writeNavState({ stack, index: nextIndex });
    router.push(target);
    setCanGoBack(nextIndex > 0);
    setCanGoForward(nextIndex < stack.length - 1);
    window.setTimeout(() => {
      syncingRef.current = false;
    }, 0);
  }, [router]);

  const goForward = useCallback(() => {
    const { stack, index } = readNavState();
    if (index >= stack.length - 1) return;
    const nextIndex = index + 1;
    const target = stack[nextIndex];
    if (!target) return;
    syncingRef.current = true;
    writeNavState({ stack, index: nextIndex });
    router.push(target);
    setCanGoBack(nextIndex > 0);
    setCanGoForward(nextIndex < stack.length - 1);
    window.setTimeout(() => {
      syncingRef.current = false;
    }, 0);
  }, [router]);

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50/90 p-0.5 shadow-sm",
        className
      )}
      role="navigation"
      aria-label="페이지 이동"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-gray-700 hover:bg-white hover:text-gray-900 disabled:text-gray-300"
        disabled={!canGoBack}
        title="뒤로"
        aria-label="뒤로"
        onClick={goBack}
      >
        <ArrowLeft className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-gray-700 hover:bg-white hover:text-gray-900 disabled:text-gray-300"
        disabled={!canGoForward}
        title="앞으로"
        aria-label="앞으로"
        onClick={goForward}
      >
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
