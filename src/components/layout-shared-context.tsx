"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { HeaderBootstrapData } from "@/lib/header-bootstrap";

type LayoutSharedValue = HeaderBootstrapData & {
  setLogoUrl: (v: string | null) => void;
};

const LayoutSharedContext = createContext<LayoutSharedValue | null>(null);

export function useLayoutShared(): LayoutSharedValue {
  const v = useContext(LayoutSharedContext);
  if (!v) throw new Error("useLayoutShared requires LayoutSharedProvider");
  return v;
}

export function LayoutSharedProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial: HeaderBootstrapData;
}) {
  const [appMode, setAppMode] = useState(initial.appMode);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(
    initial.notificationUnreadCount
  );

  useEffect(() => {
    setAppMode(initial.appMode);
    setLogoUrl(initial.logoUrl);
    setNotificationUnreadCount(initial.notificationUnreadCount);
  }, [initial.appMode, initial.logoUrl, initial.notificationUnreadCount]);

  const value = useMemo(
    () =>
      ({
        appMode,
        logoUrl,
        notificationUnreadCount,
        setLogoUrl,
      }) satisfies LayoutSharedValue,
    [appMode, logoUrl, notificationUnreadCount]
  );

  return (
    <LayoutSharedContext.Provider value={value}>{children}</LayoutSharedContext.Provider>
  );
}
