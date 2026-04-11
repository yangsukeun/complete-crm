import type { MetadataRoute } from "next";

/**
 * PWA·iOS 홈 화면 설치 아이콘 = 탭과 동일 (`/api/branding/favicon` — DB 로고 또는 favicon.ico).
 * 빌드 시점 DB와 무관하게 항상 동일 URL을 넣어 정적 매니페스트에도 안전합니다.
 */
export default function manifest(): MetadataRoute.Manifest {
  const iconSrc = "/api/branding/favicon";

  return {
    name: "COMPLETE CRM",
    short_name: "CRM",
    description: "주식회사 컴플리트 CRM",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#8B5CF6",
    orientation: "portrait",
    icons: [
      { src: iconSrc, sizes: "192x192", purpose: "any" },
      { src: iconSrc, sizes: "512x512", purpose: "any" },
      { src: iconSrc, sizes: "512x512", purpose: "maskable" },
    ],
  };
}
