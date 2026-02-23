import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 아이콘/UI 라이브러리 트리쉐이킹으로 번들 축소 → 페이지 전환 시 로드 감소
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@mantine/core",
      "@mantine/hooks",
    ],
  },
};

export default nextConfig;
