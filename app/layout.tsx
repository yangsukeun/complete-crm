import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { getCompanyLogoUrl } from "@/lib/header-bootstrap";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { getClientIp, ensureAccessLog } from "@/lib/access-log";
import { authWithTimeout } from "@/lib/auth-safe";
import { buildSwrLayoutFallback, getHeaderBootstrapData } from "@/lib/header-bootstrap";
import { AppNavClient } from "@/components/app-nav-client";
import { NotificationEntryBanner } from "@/components/notification-entry-banner";
/* OneSignal: src/components/providers.tsx 안의 <OneSignalBridge /> — 클라이언트에서 init + login(User.id). _app.tsx 없음(App Router). */
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  // [PERF-2차] 실사용은 CSS 변수만 즉시 적용·하이드레이션 직후 텍스트 페인트와 맞춤 (불필요 preload 경고 완화)
  preload: false,
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
  display: "swap",
});

const defaultMetadata: Metadata = {
  title: "COMPLETE CRM",
  description: "주식회사 컴플리트 CRM",
  manifest: "/manifest.json",
  // [PERF-2차] 존재하지 않는 og 경로(404) 방지 — manifest와 동일 아이콘 사용
  openGraph: {
    title: "COMPLETE CRM",
    description: "주식회사 컴플리트 CRM",
    images: [{ url: "/icons/icon-192x192.png", width: 192, height: 192, alt: "COMPLETE CRM" }],
  },
  twitter: {
    card: "summary",
    title: "COMPLETE CRM",
    description: "주식회사 컴플리트 CRM",
    images: ["/icons/icon-192x192.png"],
  },
  /* 단일 출처 — /api/branding/favicon 이 DB 로고 또는 public/favicon.ico 바이트를 내려줌 */
  icons: {
    icon: [{ url: "/api/branding/favicon" }],
    apple: "/api/branding/favicon",
  },
  themeColor: "#8B5CF6",
  appleWebApp: {
    capable: true,
    title: "COMPLETE CRM",
    statusBarStyle: "default",
  },
};

/** 회사 로고(헤더와 동일)가 있으면 OG/Twitter 이미지에 직접 URL — 파비콘은 항상 /api/branding/favicon */
export async function generateMetadata(): Promise<Metadata> {
  const logoUrl = (await getCompanyLogoUrl())?.trim();
  if (!logoUrl) {
    return defaultMetadata;
  }
  return {
    ...defaultMetadata,
    openGraph: {
      ...defaultMetadata.openGraph,
      images: [{ url: logoUrl, width: 192, height: 192, alt: "COMPLETE CRM" }],
    },
    twitter: {
      ...defaultMetadata.twitter,
      images: [logoUrl],
    },
  };
}

// layout에서 headers() 사용으로 정적 렌더 불가. 동적 렌더 명시해 빌드/런타임 오류 방지.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";
  const isPublicPage =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/login/");

  // [PERF-auto] 세션과 쿠키 병렬 — 부트스트랩에서 cookies 재호출 최소화
  const [cookieStore, sessionResult] = await Promise.all([
    cookies(),
    isPublicPage
      ? Promise.resolve<Awaited<ReturnType<typeof authWithTimeout>>>(null)
      : authWithTimeout().catch((e: unknown) => {
          console.error("[layout] auth failed", e);
          return null;
        }),
  ]);

  let session = sessionResult;
  if (!isPublicPage && session?.user?.id) {
    if (
      process.env.NODE_ENV === "development" ||
      process.env.ENABLE_ACCESS_LOG === "true"
    ) {
      void ensureAccessLog(
        session.user.id,
        getClientIp(h),
        h.get("user-agent") ?? ""
      ).catch((e: unknown) => console.error("[AccessLog] 기록 실패:", e));
    }
  }

  const headerBootstrap = await getHeaderBootstrapData(session?.user?.id, cookieStore);
  // [PERF-mode-logo] mode/logo/unread — SWR fallback 키 문자열은 훅과 바이트 단위 동일
  const swrLayoutFallback = buildSwrLayoutFallback(headerBootstrap, session?.user?.id);

  return (
    <html lang="en">
      <body
        className={`${typeof geistSans?.variable === "string" ? geistSans.variable : ""} ${typeof geistMono?.variable === "string" ? geistMono.variable : ""} antialiased`}
      >
        <Providers
          session={session ?? undefined}
          headerBootstrap={headerBootstrap}
          swrLayoutFallback={swrLayoutFallback}
        >
          <AppNavClient />
          <main>
            <NotificationEntryBanner />
            {children}
          </main>
          <Toaster richColors position="top-center" />
        </Providers>
      </body>
    </html>
  );
}
