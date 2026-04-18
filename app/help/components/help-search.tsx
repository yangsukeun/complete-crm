"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Hit = { slug: string; title: string; summary: string; category: string };
type Group = { category: string; label: string; items: Hit[] };

async function fetchSearch(q: string): Promise<Group[]> {
  const res = await fetch(`/api/help/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
  if (!res.ok) return [];
  const j = (await res.json()) as { groups?: Group[] };
  return Array.isArray(j.groups) ? j.groups : [];
}

export function HelpSearch({
  variant = "hero",
  autoFocus,
  onPick,
  className,
}: {
  variant?: "hero" | "compact" | "modal";
  autoFocus?: boolean;
  onPick?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (query: string) => {
    const t = query.trim();
    if (!t) {
      setGroups([]);
      return;
    }
    setLoading(true);
    try {
      const g = await fetchSearch(t);
      setGroups(g);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void run(q);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, run]);

  const big = variant === "hero" || variant === "modal";

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-border bg-background shadow-sm",
          big ? "px-4 py-3" : "px-2 py-1.5"
        )}
      >
        <Search className="text-muted-foreground size-5 shrink-0" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              router.push(`/help?q=${encodeURIComponent(q.trim())}`);
              onPick?.();
            }
          }}
          placeholder="도움말 검색… (제목·요약·본문)"
          className={cn("border-0 bg-transparent shadow-none focus-visible:ring-0", big ? "h-11 text-base" : "h-9")}
          autoFocus={autoFocus}
          aria-label="도움말 검색"
        />
        {loading && <span className="text-muted-foreground shrink-0 text-xs">검색 중</span>}
      </div>
      {q.trim().length > 0 && groups.length > 0 ? (
        <div
          className={cn(
            "absolute left-0 right-0 z-40 mt-1 max-h-[min(70vh,24rem)] overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg",
            variant === "modal" ? "top-full" : "top-full"
          )}
        >
          {groups.map((g) => (
            <div key={g.category} className="mb-2 last:mb-0">
              <p className="text-muted-foreground px-2 py-1 text-[11px] font-semibold uppercase">{g.label}</p>
              <ul>
                {g.items.map((it) => (
                  <li key={it.slug}>
                    <Link
                      href={`/help/${encodeURIComponent(it.slug)}`}
                      className="block rounded-md px-2 py-2 text-sm hover:bg-muted"
                      onClick={onPick}
                    >
                      <span className="font-medium">{it.title}</span>
                      <span className="text-muted-foreground line-clamp-1 text-xs">{it.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
