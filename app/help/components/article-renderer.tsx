"use client";

import { MarkdownRenderer } from "@/components/ui/markdown-renderer";

/** 도움말 본문: 마크다운(코드·링크·GFM) — MarkdownRenderer 재사용 */
export function ArticleRenderer({ content, className }: { content: string; className?: string }) {
  return <MarkdownRenderer content={content} className={className} />;
}
