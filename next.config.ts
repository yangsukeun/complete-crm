import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Supabase: 앱 쿼리는 DATABASE_URL에 Pooler(6543) 권장, prisma migrate는 DIRECT_URL(5432).
// 아이콘/UI 라이브러리 트리쉐이킹으로 번들 축소 → 페이지 전환 시 로드 감소
const nextConfig: NextConfig = {
  /** 배포마다 고유 빌드 ID → 이전 배포의 정적 청크 URL과 충돌(404) 완화 */
  generateBuildId: async () => {
    return Date.now().toString();
  },
  experimental: {
    optimizeCss: true,
    /** Server Actions 본문 한도 (Route Handler는 플랫폼 제한이 별도일 수 있음) */
    serverActions: {
      bodySizeLimit: "10mb",
    },
    optimizePackageImports: [
      "lucide-react",
      "@mantine/core",
      "@mantine/hooks",
      "date-fns",
      "recharts",
      "@xyflow/react",
    ],
  },
  images: {
    minimumCacheTTL: 3600,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "drive.google.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/**",
      },
    ],
  },
};

export default withBundleAnalyzer(nextConfig);
