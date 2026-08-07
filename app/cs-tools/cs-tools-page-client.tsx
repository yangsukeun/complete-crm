"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Link2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
    window.open(tool.url, "_blank", "noopener,noreferrer");
    // 비동기 — UI 블로킹 없음
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

  const categories = data?.categories ?? [];

  if (categories.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 py-16 text-center text-sm text-muted-foreground">
        등록된 CS 도구가 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        임시 플레이스홀더입니다. CS팀장 확인 후 실제 도구명·URL로 교체해야 합니다.
      </p>
      {categories.map((cat) => {
        const tools = data?.byCategory[cat] ?? [];
        return (
          <section key={cat}>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
              <Link2 className="size-4 text-muted-foreground" />
              {cat}
              <span className="text-xs font-normal text-muted-foreground">({tools.length})</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => openTool(tool)}
                  className={cn(
                    "group flex flex-col items-start gap-1.5 rounded-lg border bg-card p-4 text-left",
                    "transition-colors hover:border-sky-300 hover:bg-sky-50/60"
                  )}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span className="font-medium text-gray-900 group-hover:text-sky-900">
                      {tool.name}
                    </span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
                  </div>
                  {tool.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{tool.description}</p>
                  )}
                  <span className="mt-auto pt-1 text-[11px] text-muted-foreground">
                    클릭 {tool.clickCount}회
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
