"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

function storageKey(userId: string, featureKey: string) {
  return `newBadgeSeen:${userId}:${featureKey}`;
}

/**
 * NEW 배지. expiresAt 이전이고, 클릭·로컬 저장 전까지 표시.
 * @param expiresAt ISO 날짜 문자열 — 현재 시각이 이후면 렌더하지 않음
 */
export function NewBadge({
  featureKey,
  expiresAt,
  className,
}: {
  featureKey: string;
  expiresAt: string;
  className?: string;
}) {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const expired = useMemo(() => {
    const t = Date.parse(expiresAt);
    return Number.isNaN(t) || Date.now() > t;
  }, [expiresAt]);

  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!userId) return;
    try {
      if (localStorage.getItem(storageKey(userId, featureKey)) === "1") setHidden(true);
    } catch {
      /* ignore */
    }
  }, [userId, featureKey]);

  const markSeen = useCallback(() => {
    if (!userId) return;
    try {
      localStorage.setItem(storageKey(userId, featureKey), "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  }, [userId, featureKey]);

  if (expired || !userId || hidden) return null;

  return (
    <button
      type="button"
      onClick={markSeen}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-pink-500 to-sky-500 px-1.5 py-0 text-[10px] font-bold uppercase leading-none text-white shadow-sm",
        className
      )}
      title="새 기능 — 클릭하면 숨깁니다"
    >
      NEW
    </button>
  );
}
