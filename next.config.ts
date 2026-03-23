import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Supabase: 앱 쿼리는 DATABASE_URL에 Pooler(6543) 권장, prisma migrate는 DIRECT_URL(5432).
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
