import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { getClientIp, ensureAccessLog } from "@/lib/access-log";
import { authWithTimeout } from "@/lib/auth-safe";
import { AppNavClient } from "@/components/app-nav-client";
/* OneSignal: src/components/providers.tsx 안의 <OneSignalBridge /> — 클라이언트에서 init + login(User.id). _app.tsx 없음(App Router). */
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: "COMPLETE CRM",
  description: "주식회사 컴플리트 CRM",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: "/apple-touch-icon.png",
  },
  themeColor: "#8B5CF6",
  appleWebApp: {
    capable: true,
    title: "COMPLETE CRM",
    statusBarStyle: "default",
  },
};

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

  let session: Awaited<ReturnType<typeof authWithTimeout>> = null;
  if (!isPublicPage) {
    try {
      session = await authWithTimeout();
      if (session?.user?.id) {
        // 성능: 프로덕션에서는 초기 렌더마다 DB를 치지 않도록 기본 비활성화
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
    } catch (e) {
      console.error("[layout] auth failed", e);
    }
  }

  return (
    <html lang="en">
      <body
        className={`${typeof geistSans?.variable === "string" ? geistSans.variable : ""} ${typeof geistMono?.variable === "string" ? geistMono.variable : ""} antialiased`}
      >
        <Providers session={session ?? undefined}>
          <AppNavClient />
          <main>{children}</main>
          <Toaster richColors position="top-center" />
        </Providers>
      </body>
    </html>
  );
}
