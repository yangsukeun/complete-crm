"use client";

import useSWR from "swr";
import { useInView } from "react-intersection-observer";

async function linkPreviewFetcher(key: string): Promise<{
  url?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  error?: string;
}> {
  const res = await fetch(key, { credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return { error: typeof data.error === "string" ? data.error : "요청 실패" };
  return data as { url?: string; title?: string; description?: string; image?: string; siteName?: string };
}

/**
 * 뷰포트 진입 후에만 `/api/link-preview` 호출 + SWR 클라이언트 캐시.
 * BlockNote 커스텀 블록은 DOM 기반이라 네이티브 IO를 쓰고, React 카드용으로 이 훅을 사용할 수 있다.
 */
export function useLinkPreviewInView(url: string | undefined | null) {
  const { ref, inView } = useInView({ triggerOnce: true, rootMargin: "100px", threshold: 0 });
  const swrKey =
    inView && url?.trim()
      ? `/api/link-preview?url=${encodeURIComponent(url.trim())}`
      : null;
  return {
    ref,
    inView,
    ...useSWR(swrKey, linkPreviewFetcher, {
      dedupingInterval: 3_600_000,
      revalidateOnFocus: false,
      revalidateOnMount: true,
      shouldRetryOnError: false,
    }),
  };
}
