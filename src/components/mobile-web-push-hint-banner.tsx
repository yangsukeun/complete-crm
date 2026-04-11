"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "crm-mobile-push-hint-dismissed";

function isInAppEmbeddedBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /\bFBAN|\bFBAV|Instagram|KAKAOTALK|Line\/|NAVER\(|; wv\)|WebView/i.test(ua);
}

/** iPhone·iPad Safari/Chrome (데스크톱 맥 사파리 제외) */
function isIosTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOS13Plus = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadOS13Plus;
}

function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { navigator: Navigator & { standalone?: boolean } };
  if (w.matchMedia("(display-mode: standalone)").matches) return true;
  if (w.matchMedia("(display-mode: fullscreen)").matches) return true;
  return w.navigator.standalone === true;
}

/**
 * 모바일 웹푸시 제약 안내 (iOS 홈화면 PWA, 인앱 브라우저).
 * PC만 등록되고 휴대폰이 안 오는 경우 대부분 여기 해당.
 */
export function MobileWebPushHintBanner() {
  const { data: session, status } = useSession();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading" || !session?.user?.id) return;
    if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) return;
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* */
    }

    if (isInAppEmbeddedBrowser()) {
      setMessage(
        "카카오톡·네이버·인스타 등 앱 안 브라우저에서는 웹 푸시가 동작하지 않는 경우가 많습니다. Chrome 또는 Safari로 주소를 열어 주세요."
      );
      setVisible(true);
      return;
    }

    if (isIosTouchDevice() && !isStandaloneDisplayMode()) {
      setMessage(
        "iPhone/iPad에서는 Apple 정책상, 사이트를 홈 화면에 추가한 뒤 그 아이콘으로 연 앱에서 알림을 허용해야 휴대폰 푸시가 옵니다. 지금은 일반 브라우저 탭일 수 있습니다."
      );
      setVisible(true);
    }
  }, [session?.user?.id, status]);

  if (!visible || !message) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* */
    }
    setVisible(false);
  };

  return (
    <div
      role="status"
      className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-foreground"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-3">
        <span className="text-pretty">{message}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={dismiss} aria-label="안내 닫기">
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
