"use client";

import { SessionProvider } from "next-auth/react";

/** @deprecated 레이아웃은 `src/components/providers` 를 사용합니다. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
