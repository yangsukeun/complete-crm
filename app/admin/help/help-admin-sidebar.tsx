"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, string> = {
  "getting-started": "시작하기",
  mindmap: "마인드맵",
  tasks: "업무",
  projects: "프로젝트",
  notifications: "알림",
  admin: "관리",
};

export type HelpSidebarArticle = {
  slug: string;
  title: string;
  category: string;
  isPublished: boolean;
  orderIndex: number;
};

export function HelpAdminSidebar({ articles }: { articles: HelpSidebarArticle[] }) {
  const pathname = usePathname();
  const byCat = new Map<string, HelpSidebarArticle[]>();
  for (const a of articles) {
    const list = byCat.get(a.category) ?? [];
    list.push(a);
    byCat.set(a.category, list);
  }
  const categories = Array.from(byCat.keys()).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <Link
        href="/admin/help/changelog"
        className="block w-full rounded-md border border-border bg-background px-2 py-2 text-center text-xs font-medium hover:bg-muted/50"
      >
        릴리즈 노트
      </Link>
      <Link
        href="/admin/help/articles/new"
        className="block w-full rounded-md border border-dashed border-border bg-background px-2 py-2 text-center text-xs font-medium hover:bg-muted/50"
      >
        + 새 문서
      </Link>
      {categories.map((cat) => (
        <div key={cat}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABEL[cat] ?? cat}
          </p>
          <ul className="space-y-0.5">
            {(byCat.get(cat) ?? [])
              .slice()
              .sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title))
              .map((a) => {
                const href = `/admin/help/articles/${a.slug}`;
                const active = pathname === href;
                return (
                  <li key={a.slug}>
                    <Link
                      href={href}
                      className={cn(
                        "block rounded-md px-2 py-1.5 text-sm leading-snug hover:bg-muted/80",
                        active && "bg-primary/10 font-medium text-primary",
                        !a.isPublished && "opacity-70"
                      )}
                    >
                      {!a.isPublished && <span className="text-muted-foreground">[초안] </span>}
                      {a.title}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
