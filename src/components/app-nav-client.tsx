"use client";

import nextDynamic from "next/dynamic";

/**
 * Next.js 16: `ssr: false` dynamic는 Server Component(layout)에서 금지 → 클라이언트 경계에서만 로드.
 * AppNav의 useSearchParams()와 맞물린 Suspense 하이드레이션(React #419) 완화용.
 */
const AppNavLazy = nextDynamic(
  () => import("@/components/app-nav").then((m) => ({ default: m.AppNav })),
  {
    ssr: false,
    loading: () => <header className="h-16 border-b border-gray-200" />,
  }
);

export function AppNavClient() {
  return <AppNavLazy />;
}
