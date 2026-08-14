"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CS_TOOL_CATEGORY_ORDER, csToolCategoryTone } from "@/lib/cs-tools";
import { chipAccentBorderClass, chipCardHoverClass } from "@/lib/color-chip";
import { ColorChip } from "@/components/ui/color-chip";

type CsTool = {
  id: string;
  name: string;
  url: string;
  category: string;
  description: string | null;
  clickCount: number;
  order: number;
};

type ListPayload = {
  tools: CsTool[];
  categories: string[];
  byCategory: Record<string, CsTool[]>;
  total: number;
  error?: string;
};

export function CsToolsPageClient() {
  const [data, setData] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("__ALL__");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cs-tools");
      const body = (await res.json().catch(() => ({}))) as ListPayload;
      if (!res.ok) {
        throw new Error(body.error || "목록을 불러오지 못했습니다.");
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openTool = (tool: CsTool) => {
    if (tool.url.startsWith("/")) {
      window.location.assign(tool.url);
    } else {
      window.open(tool.url, "_blank", "noopener,noreferrer");
    }
    void fetch(`/api/cs-tools/${encodeURIComponent(tool.id)}/click`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as { clickCount?: number } | null;
        if (typeof body?.clickCount !== "number") return;
        setData((prev) => {
          if (!prev) return prev;
          const bump = (t: CsTool) =>
            t.id === tool.id ? { ...t, clickCount: body.clickCount! } : t;
          return {
            ...prev,
            tools: prev.tools.map(bump),
            byCategory: Object.fromEntries(
              Object.entries(prev.byCategory).map(([k, list]) => [k, list.map(bump)])
            ),
          };
        });
      })
      .catch(() => {
        /* 클릭 로그 실패는 UX에 영향 없음 */
      });
  };

  const categories = data?.categories ?? [];

  /** 데이터에 있는 카테고리 + 정의된 순서 */
  const filterOptions = useMemo(() => {
    const present = new Set(categories);
    const ordered = CS_TOOL_CATEGORY_ORDER.filter((c) => present.has(c));
    const extras = categories.filter(
      (c) => !(CS_TOOL_CATEGORY_ORDER as readonly string[]).includes(c)
    );
    return [...ordered, ...extras];
  }, [categories]);

  const visibleCategories = useMemo(() => {
    if (filter === "__ALL__") return categories;
    return categories.filter((c) => c === filter);
  }, [categories, filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        불러오는 중…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-8 text-center text-sm text-rose-800">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 text-sm font-medium text-rose-900 underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 py-16 text-center text-sm text-muted-foreground">
        등록된 CS 도구가 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("__ALL__")}
          className="cursor-pointer rounded-[0.75rem] border-0 bg-transparent p-0"
        >
          <ColorChip tone="gray" selected={filter === "__ALL__"}>
            전체 ({data?.total ?? 0})
          </ColorChip>
        </button>
        {filterOptions.map((cat) => {
          const n = data?.byCategory[cat]?.length ?? 0;
          const tone = csToolCategoryTone(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className="cursor-pointer rounded-[0.75rem] border-0 bg-transparent p-0"
            >
              <ColorChip tone={tone} selected={filter === cat}>
                {cat} ({n})
              </ColorChip>
            </button>
          );
        })}
      </div>

      {visibleCategories.map((cat) => {
        const tools = data?.byCategory[cat] ?? [];
        const tone = csToolCategoryTone(cat);
        return (
          <section key={cat}>
            <h2 className="cs-section-title mb-4 flex items-center gap-2">
              <ColorChip tone={tone} icon={<Link2 />}>
                {cat}
              </ColorChip>
              <span className="text-muted-foreground text-sm font-medium">({tools.length})</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => openTool(tool)}
                  className={cn(
                    "group flex flex-col items-start gap-2 rounded-xl border bg-card p-5 text-left",
                    "transition-colors",
                    chipAccentBorderClass(tone),
                    chipCardHoverClass(tone)
                  )}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span className="text-base font-semibold text-foreground">{tool.name}</span>
                    {!tool.url.startsWith("/") && (
                      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
                    )}
                  </div>
                  {tool.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
                  )}
                  <span className="text-muted-foreground mt-auto pt-1 text-xs">클릭 {tool.clickCount}회</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
