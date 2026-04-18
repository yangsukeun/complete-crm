"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { HELP_CATEGORY_NAV } from "@/lib/help-categories";

export function HelpSidebarContent({
  isAdmin,
  onNavigate,
}: {
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const linkCls = (active: boolean) =>
    cn(
      "block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
      active && "bg-primary/10 font-medium text-primary"
    );

  return (
    <nav className="space-y-6" aria-label="도움말 섹션">
      <div>
        <p className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-wide">가이드</p>
        <ul className="space-y-0.5">
          <li>
            <Link href="/help" className={linkCls(pathname === "/help")} onClick={onNavigate}>
              전체 보기
            </Link>
          </li>
          {HELP_CATEGORY_NAV.filter((c) => !("adminOnly" in c) || isAdmin).map((c) => (
            <li key={c.id}>
              <Link
                href={`/help#help-cat-${c.id}`}
                className={linkCls(false)}
                onClick={onNavigate}
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-wide">기타</p>
        <ul className="space-y-0.5">
          <li>
            <Link
              href="/help/changelog"
              className={linkCls(pathname === "/help/changelog")}
              onClick={onNavigate}
            >
              <span className="flex items-center gap-2">
                <History className="size-4 shrink-0 opacity-70" />
                변경 이력
              </span>
            </Link>
          </li>
          <li>
            <Link href="/help#help-faq" className={linkCls(false)} onClick={onNavigate}>
              <span className="flex items-center gap-2">
                <FileText className="size-4 shrink-0 opacity-70" />
                FAQ
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  );
}
