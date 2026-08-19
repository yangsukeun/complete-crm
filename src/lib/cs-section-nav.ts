import { csClientNavLabel } from "@/lib/cs-client-access";

export type CsSectionNavId =
  | "hub"
  | "notice"
  | "lounge"
  | "clients"
  | "org"
  | "org-month"
  | "org-settings"
  | "attendance"
  | "away"
  | "idle";

export type CsSectionNavItem = {
  id: CsSectionNavId;
  href: string;
  label: string;
};

function pathOnly(pathname: string): string {
  return pathname.split("?")[0] || pathname;
}

/** CS 링크 구역 — 메인 CRM 헤더가 아니라 CS 전용 상단 메뉴를 쓴다 */
export function isCsSectionPath(pathname: string): boolean {
  const p = pathOnly(pathname);
  return (
    p === "/cs-tools" ||
    p.startsWith("/cs-tools/") ||
    p === "/cs-lounge" ||
    p.startsWith("/cs-lounge/") ||
    p === "/cs-clients" ||
    p.startsWith("/cs-clients/") ||
    p === "/cs-org" ||
    p.startsWith("/cs-org/")
  );
}

export function csSectionNavItems(opts: {
  canManageClients: boolean;
  canViewAwayOverview: boolean;
}): CsSectionNavItem[] {
  const items: CsSectionNavItem[] = [
    { id: "hub", href: "/cs-tools", label: "CS 링크" },
    { id: "notice", href: "/cs-lounge?tab=notice", label: "공지사항" },
    { id: "lounge", href: "/cs-lounge?tab=lounge", label: "익명 라운지" },
    { id: "clients", href: "/cs-clients", label: csClientNavLabel(opts.canManageClients) },
  ];
  if (opts.canManageClients) {
    items.push(
      { id: "org", href: "/cs-org", label: "조직도" },
      { id: "org-month", href: "/cs-org/month", label: "월별 담당" },
      { id: "org-settings", href: "/cs-org/settings", label: "설정 창고" },
    );
  }
  if (opts.canViewAwayOverview) {
    items.push(
      { id: "attendance", href: "/cs-tools/attendance", label: "CS 근태" },
      { id: "away", href: "/cs-tools/away", label: "이석 현황" },
      { id: "idle", href: "/cs-tools/idle", label: "자동 이석" },
    );
  }
  return items;
}

export function csSectionNavItemActive(opts: {
  id: CsSectionNavId;
  pathname: string;
  tab?: string | null;
}): boolean {
  const p = pathOnly(opts.pathname);
  switch (opts.id) {
    case "hub":
      return p === "/cs-tools";
    case "notice":
      return p === "/cs-lounge" && opts.tab === "notice";
    case "lounge":
      return p === "/cs-lounge" && opts.tab === "lounge";
    case "clients":
      return p === "/cs-clients" || p.startsWith("/cs-clients/");
    case "org":
      return p === "/cs-org";
    case "org-month":
      return p === "/cs-org/month" || p.startsWith("/cs-org/month/");
    case "org-settings":
      return p === "/cs-org/settings" || p.startsWith("/cs-org/settings/");
    case "attendance":
      return p === "/cs-tools/attendance" || p.startsWith("/cs-tools/attendance/");
    case "away":
      return p === "/cs-tools/away" || p.startsWith("/cs-tools/away/");
    case "idle":
      return (
        p === "/cs-tools/idle" ||
        p.startsWith("/cs-tools/idle/") ||
        p === "/cs-tools/idle-settings" ||
        p.startsWith("/cs-tools/idle-settings/")
      );
  }
}
