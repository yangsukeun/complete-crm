import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArticleRenderer } from "../components/article-renderer";

export const dynamic = "force-dynamic";

function categoryBadgeVariant(cat: string): "default" | "secondary" | "destructive" {
  if (cat === "breaking") return "destructive";
  if (cat === "fix") return "secondary";
  return "default";
}

function categoryLabel(cat: string) {
  if (cat === "feature") return "기능";
  if (cat === "fix") return "수정";
  if (cat === "breaking") return "주의";
  return cat;
}

export default async function HelpChangelogPage() {
  const notes = await prisma.releaseNote.findMany({
    orderBy: { releasedAt: "desc" },
    take: 120,
  });

  const today = new Date();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">변경 이력</h1>
          <p className="text-muted-foreground mt-1 text-sm">버전별 릴리즈 노트를 시간순(최신 먼저)으로 모았습니다.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/help">← 도움말 허브</Link>
        </Button>
      </div>

      <ul className="relative space-y-0 pl-2">
        <div className="bg-border absolute bottom-0 left-[11px] top-2 w-px" aria-hidden />
        {notes.map((n) => {
          const days = differenceInCalendarDays(today, n.releasedAt);
          const isNew = days >= 0 && days <= 30;
          return (
            <li key={n.id} className="relative pb-12 last:pb-0">
              <span
                className="border-background bg-primary absolute left-0 top-2 z-[1] size-3 rounded-full border-2 shadow-sm"
                aria-hidden
              />
              <div className="pl-8">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{n.version}</span>
                  <span className="text-muted-foreground text-xs">
                    {format(n.releasedAt, "PPP", { locale: ko })}
                  </span>
                  <Badge variant={categoryBadgeVariant(n.category)} className="text-[10px] uppercase">
                    {categoryLabel(n.category)}
                  </Badge>
                  {isNew ? (
                    <Badge variant="outline" className="border-primary/50 text-primary text-[10px]">
                      NEW
                    </Badge>
                  ) : null}
                </div>
                <h2 className="text-lg font-semibold leading-snug">{n.title}</h2>
                <div className="text-muted-foreground mt-3 text-sm leading-relaxed">
                  <ArticleRenderer content={n.bodyMd} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
