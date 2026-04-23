"use client";

import { useEffect } from "react";

type Input =
  | { relatedType: string; relatedId?: string | null; types?: string[]; linkFallback?: string[] }
  | null;

export function useAutoReadOnEnter(input: Input, debounceKey: string) {
  useEffect(() => {
    if (!input) return;
    if (!input.relatedType) return;

    const key = `auto-read:${debounceKey}`;
    const lastCall = sessionStorage.getItem(key);
    if (lastCall && Date.now() - Number(lastCall) < 5000) return; // 5초 디바운스
    sessionStorage.setItem(key, String(Date.now()));

    void fetch("/api/notifications/auto-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    })
      .then(() => {
        window.dispatchEvent(new Event("notification-realtime"));
      })
      .catch(() => {});
  }, [input, debounceKey]);
}

