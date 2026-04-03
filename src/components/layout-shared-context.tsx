"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { HeaderBootstrapData } from "@/lib/header-bootstrap";

type LayoutSharedValue = HeaderBootstrapData & {
  setLogoUrl: (v: string | null) => void;
};

const LayoutSharedContext = createContext<LayoutSharedValue | null>(null);

const BRAND_ICON_ATTR = "data-crm-brand-icon";

function syncHeadBrandIcons(logoUrl: string | null) {
  if (typeof document === "undefined") return;
  document.head.querySelectorAll(`link[${BRAND_ICON_ATTR}]`).forEach((n) => n.remove());
  if (!logoUrl?.trim()) return;
  const href = `/api/branding/favicon?t=${Date.now()}`;
  const icon = document.createElement("link");
  icon.rel = "icon";
  icon.href = href;
  icon.setAttribute(BRAND_ICON_ATTR, "1");
  document.head.appendChild(icon);
  const shortcut = document.createElement("link");
  shortcut.rel = "shortcut icon";
  shortcut.href = href;
  shortcut.setAttribute(BRAND_ICON_ATTR, "1");
  document.head.appendChild(shortcut);
  const apple = document.createElement("link");
  apple.rel = "apple-touch-icon";
  apple.href = href;
  apple.setAttribute(BRAND_ICON_ATTR, "1");
  document.head.appendChild(apple);
}

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

  const skipNextBrandIconSync = useRef(true);

  useEffect(() => {
    setAppMode(initial.appMode);
    setLogoUrl(initial.logoUrl);
    setNotificationUnreadCount(initial.notificationUnreadCount);
  }, [initial.appMode, initial.logoUrl, initial.notificationUnreadCount]);

  /* 로고 URL이 바뀐 뒤(관리자 저장 등) 탭 아이콘 즉시 반영 — 최초 페인트는 generateMetadata와 동일 URL */
  useEffect(() => {
    if (skipNextBrandIconSync.current) {
      skipNextBrandIconSync.current = false;
      return;
    }
    syncHeadBrandIcons(logoUrl);
  }, [logoUrl]);

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
