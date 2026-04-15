import type { MetadataRoute } from "next";

/**
 * 설치·홈 화면 아이콘은 PNG 전용 엔드포인트 사용.
 * `/api/branding/favicon`은 .ico·원본 MIME일 수 있어 PWA가 무시하고 이니셜(C)만 그리는 경우가 많음.
 */
export default function manifest(): MetadataRoute.Manifest {
  /** `gcm_sender_id` 는 Next 타입에 없으나 Chrome FCM 웹 푸시에 필요 — 런타임 manifest JSON에 포함 */
  return {
    name: "COMPLETE CRM",
    short_name: "CRM",
    description: "주식회사 컴플리트 CRM",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6D28D9",
    orientation: "portrait",
    icons: [
      {
        src: "/api/branding/pwa-icon?size=144",
        sizes: "144x144",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/api/branding/pwa-icon?size=192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/api/branding/pwa-icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/api/branding/pwa-icon?size=512&mask=1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    gcm_sender_id: "482941778946",
  } as MetadataRoute.Manifest;
}
