"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { DocsEditorProps } from "./docs-editor";

// [PERF-C] BlockNote 문서 에디터 지연 로드
const DocsEditor = dynamic(() => import("./docs-editor").then((m) => m.DocsEditor), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[400px] items-center justify-center text-muted-foreground text-sm">
      에디터 불러오는 중...
    </div>
  ),
});

type DocsEditorDynamicProps = DocsEditorProps;

export function DocsEditorDynamic({ className }: DocsEditorDynamicProps) {
  return (
    <div className={cn("w-full", className)}>
      <DocsEditor className={className} />
    </div>
  );
}
