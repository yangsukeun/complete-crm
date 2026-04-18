"use client";

import useSWR from "swr";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ArticleLite = { slug: string; summary: string; title: string };

async function fetchArticle(slug: string): Promise<ArticleLite | null> {
  const res = await fetch(`/api/help/articles/${encodeURIComponent(slug)}`, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as ArticleLite;
}

/** DB 도움말 요약 툴팁(hover) + /help/[slug] 링크 */
export function HelpTooltip({ slug, className }: { slug: string; className?: string }) {
  const { data, isLoading } = useSWR(slug ? ["help-article", slug] : null, () => fetchArticle(slug), {
    revalidateOnFocus: false,
    dedupingInterval: 600_000,
  });

  return (
    <span className={cn("group relative inline-flex align-middle", className)}>
      <button
        type="button"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="도움말"
      >
        <HelpCircle className="size-3.5" />
      </button>
      <span
        className={cn(
          "pointer-events-none invisible absolute bottom-[calc(100%+6px)] left-1/2 z-[200] w-72 -translate-x-1/2 rounded-md border border-border bg-popover p-3 text-left text-popover-foreground text-sm shadow-md opacity-0 transition-opacity",
          "group-hover:visible group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100"
        )}
        role="tooltip"
      >
        {isLoading ? (
          <p className="text-muted-foreground text-xs">불러오는 중…</p>
        ) : data?.summary ? (
          <>
            <p className="leading-snug">{data.summary}</p>
            <Link
              href={`/help/${encodeURIComponent(slug)}`}
              className="pointer-events-auto mt-2 inline-block text-xs font-medium text-primary underline underline-offset-2"
            >
              자세히 →
            </Link>
          </>
        ) : (
          <p className="text-muted-foreground text-xs">도움말을 불러올 수 없습니다.</p>
        )}
      </span>
    </span>
  );
}
