"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspaceStore } from "@/store/workspace-store";

/**
 * Next.js `useSearchParams()`는 내부적으로 Suspense와 엮여 RSC 하이드레이션 시 React 419(Suspense 경계 불일치)를
 * 여러 클라이언트 트리에서 동시에 쓰면 잘 냅니다.
 * `mode` 쿼리는 이 컴포넌트 한 곳에서만 읽고 Zustand로 보냅니다.
 */
function UrlSearchModeBridgeInner() {
  const params = useSearchParams();
  const setUrlSearchMode = useWorkspaceStore((s) => s.setUrlSearchMode);
  const raw = params.get("mode");
  const normalized = raw === "MY" || raw === "TEAM" ? raw : null;

  useEffect(() => {
    setUrlSearchMode(normalized);
  }, [normalized, setUrlSearchMode]);

  return null;
}

export function UrlSearchModeBridge() {
  return (
    <Suspense fallback={null}>
      <UrlSearchModeBridgeInner />
    </Suspense>
  );
}
