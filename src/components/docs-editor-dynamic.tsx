"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const DocsEditor = dynamic(() => import("./docs-editor").then((m: any) => m.DocsEditor), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[400px] items-center justify-center text-muted-foreground text-sm">
      에디터 불러오는 중...
    </div>
  ),
});

type DocsEditorDynamicProps = {
  className?: string;
};

export function DocsEditorDynamic({ className }: DocsEditorDynamicProps) {
  return (
    <div className={cn("w-full", className)}>
      <DocsEditor {...({ className } as any)} />
    </div>
  );
}
