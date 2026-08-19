"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarDays,
  Clock,
  Link2,
  Megaphone,
  MessageCircle,
  Timer,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  csSectionNavItemActive,
  type CsSectionNavId,
  type CsSectionNavItem,
} from "@/lib/cs-section-nav";

const ICONS: Record<CsSectionNavId, LucideIcon> = {
  hub: Link2,
  notice: Megaphone,
  lounge: MessageCircle,
  clients: Building2,
  org: Users,
  "org-month": CalendarDays,
  "org-settings": Warehouse,
  attendance: Clock,
  away: Timer,
};

export function CsSectionNav({ items }: { items: CsSectionNavItem[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  return (
    <div className="border-t border-violet-100 bg-violet-50/60">
      <nav
        aria-label="CS 메뉴"
        className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8"
      >
        {items.map((item) => {
          const Icon = ICONS[item.id];
          const isActive = csSectionNavItemActive({ id: item.id, pathname, tab });
          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-white text-violet-900 shadow-sm"
                  : "text-violet-800/75 hover:bg-white/80 hover:text-violet-950"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
