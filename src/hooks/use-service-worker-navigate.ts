"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useServiceWorkerNavigate() {
  const router = useRouter();

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const handler = (e: MessageEvent) => {
      const data = (e as MessageEvent).data as { type?: string; url?: string } | null;
      if (!data || data.type !== "NAVIGATE" || !data.url) return;
      try {
        const u = new URL(data.url);
        router.push(u.pathname + u.search + u.hash);
        window.focus();
      } catch {
        // ignore
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [router]);
}

