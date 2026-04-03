"use client";

import dynamic from "next/dynamic";

// [PERF-C] 초기 번들에서 ReactFlow 분리
const CompanySkillTreeInner = dynamic(
  () =>
    import("./company-skill-tree-inner").then((m) => m.CompanySkillTreeInner),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen w-full animate-pulse bg-[#0a0f1a]" aria-hidden />
    ),
  }
);

export default function CompanySkillTreePage() {
  return <CompanySkillTreeInner />;
}
