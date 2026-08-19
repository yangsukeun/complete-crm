import { csClientNavLabel } from "@/lib/cs-client-access";

export type CsSectionNavId =
  | "hub"
  | "notice"
  | "lounge"
  | "clients"
  | "org"
  | "org-settings"
  | "attendance"
  | "away";

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
    { id: "org", href: "/cs-org", label: "조직도" },
  ];
  if (opts.canManageClients) {
    items.push({ id: "org-settings", href: "/cs-org/settings", label: "설정 창고" });
  }
  if (opts.canViewAwayOverview) {
    items.push(
      { id: "attendance", href: "/cs-tools/attendance", label: "CS 근태" },
      { id: "away", href: "/cs-tools/away", label: "이석 현황" },
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
    case "org-settings":
      return p === "/cs-org/settings" || p.startsWith("/cs-org/settings/");
    case "attendance":
      return p === "/cs-tools/attendance" || p.startsWith("/cs-tools/attendance/");
    case "away":
      return p === "/cs-tools/away" || p.startsWith("/cs-tools/away/");
  }
}
