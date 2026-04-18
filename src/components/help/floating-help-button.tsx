"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { helpSlugsForPathname } from "@/lib/help-route-docs";
import { triggerOnboardingMainTour } from "@/lib/onboarding-tour-events";

type ArticleHit = { slug: string; title: string; summary: string; category: string };
type SearchGroup = { category: string; label: string; items: ArticleHit[] };

export function FloatingHelpButton() {
  const { status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ArticleHit[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const related = useMemo(() => helpSlugsForPathname(pathname ?? ""), [pathname]);

  const runSearch = useCallback(async (query: string) => {
    const t = query.trim();
    if (!t) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/help/search?q=${encodeURIComponent(t)}`, { credentials: "include" });
      const j = res.ok ? ((await res.json()) as { groups?: SearchGroup[] }) : { groups: [] };
      const groups = Array.isArray(j.groups) ? j.groups : [];
      const flat: ArticleHit[] = [];
      for (const g of groups) {
        for (const it of g.items ?? []) flat.push(it);
      }
      setHits(flat.slice(0, 8));
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(q);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, runSearch]);

  if (status !== "authenticated") return null;
  if (pathname?.startsWith("/login") || pathname?.startsWith("/signup")) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            className="pointer-events-auto size-12 rounded-full shadow-lg"
            aria-label="도움말"
          >
            <HelpCircle className="size-6" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-80 p-3">
          <div className="space-y-3">
            <Button asChild variant="secondary" className="w-full justify-start" size="sm">
              <Link href="/help" onClick={() => setOpen(false)}>
                도움말 센터 열기
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              size="sm"
              onClick={() => {
                setOpen(false);
                triggerOnboardingMainTour();
              }}
            >
              온보딩 투어 다시 보기
            </Button>
            <div className="space-y-1">
              <p className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
                <Search className="size-3" />
                검색
              </p>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch(q);
                }}
                placeholder="제목·요약·본문 검색"
                className="h-9"
              />
              <Button type="button" size="sm" className="w-full" variant="secondary" onClick={() => void runSearch(q)}>
                {searching ? "검색 중…" : "지금 검색"}
              </Button>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
                {hits.map((h) => (
                  <li key={h.slug}>
                    <Link
                      href={`/help/${encodeURIComponent(h.slug)}`}
                      className="text-primary hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      {h.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-border pt-2">
              <p className="text-muted-foreground mb-1 text-[11px] font-medium uppercase">이 페이지 관련</p>
              <ul className="space-y-1 text-xs">
                {related.map((slug) => (
                  <li key={slug}>
                    <Link href={`/help/${slug}`} className="text-primary hover:underline" onClick={() => setOpen(false)}>
                      {slug.replace(/-/g, " ")}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
