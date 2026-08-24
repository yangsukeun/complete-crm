"use client";

import Link from "next/link";
import NextImage from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { jsonFetcher, SWR_KEYS, SWR_LOGO_SETTINGS_KEY } from "@/lib/api-swr";
import type { LogoSettingsApiPayload } from "@/lib/header-bootstrap";
import { useWorkspaceStore } from "@/store/workspace-store";
import { onesignalOptOutAndDeregister } from "@/lib/onesignal/client-logout";
import {
  Calendar,
  ListTodo,
  LayoutDashboard,
  Users,
  CalendarClock,
  MessageCircle,
  User,
  LogOut,
  FolderKanban,
  Wallet,
  FileText,
  Building2,
  Layers,
  Settings,
  ChevronDown,
  Megaphone,
  Image,
  FolderOpen,
  HardDrive,
  Sparkles,
  BrainCircuit,
  Trash2,
  Shield,
  Link2,
  Server,
  Package,
  Upload,
} from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useLayoutShared } from "@/components/layout-shared-context";
import { cn } from "@/lib/utils";
import { userHasPermission } from "@/lib/permissions";
import { isMasterEmail } from "@/lib/master-account";
import { homePathForOrg, navHrefAllowedForOrg, resolveOrgUnit } from "@/lib/org-access";
import { canManageEmployeesSync } from "@/lib/employee-admin-access";
import { canViewAwayOverview } from "@/lib/attendance-away-access";
import { canViewEmployeeLeaveSummary } from "@/lib/leave-overview-access";
import { canSeeCsToolsDashboardCard } from "@/lib/cs-tools-access";
import { canManageCsClients } from "@/lib/cs-client-access";
import { CsSectionNav } from "@/components/cs-section-nav";
import { csSectionNavItems, isCsSectionPath } from "@/lib/cs-section-nav";
import {
  BOARD_LAST_SEEN_EVENT,
  BOARD_NEW_POST_EVENT,
  ensureBoardLastSeenBaseline,
  readBoardLastSeenIso,
} from "@/lib/board-last-seen";
import { Button } from "@/components/ui/button";
import { HistoryNavButtons } from "@/components/history-nav-buttons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  featureKey?: string;
  companyOnly?: boolean;
  hint?: string;
  awayOverviewOnly?: boolean;
  csAccessOnly?: boolean;
};

// [메인]: 대시보드·CS·3PL (자주 쓰는 단일 진입)
const mainGroupLinks: NavLink[] = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard, featureKey: "dashboard" },
  { href: "/cs-tools", label: "CS 링크", icon: Link2 },
  { href: "/logistics", label: "3PL", icon: Package, hint: "3PL 물류 (준비중)" },
];

/** 게시판·드라이브·NAS — 「자료」 드롭다운 */
const resourceGroupLinks: NavLink[] = [
  { href: "/board", label: "게시판", icon: FolderOpen, featureKey: "board", companyOnly: true, hint: "공지·자료 목록" },
  { href: "/drive", label: "파일", icon: HardDrive, hint: "Google Drive" },
  { href: "/nas-drive", label: "NAS 문서함", icon: Server, hint: "사내 파일 서버" },
];

/** 공지·채팅 — 「소통」 드롭다운 */
const commsGroupLinks: NavLink[] = [
  { href: "/announcements", label: "공지사항", icon: Megaphone, featureKey: "announcements", companyOnly: true, hint: "전사 공지" },
  { href: "/chat", label: "채팅", icon: MessageCircle, featureKey: "chat", companyOnly: true, hint: "팀 대화" },
];

// [AI]: 비서·허브를 한 메뉴로 묶어 상단 폭을 아낀다
const aiGroupLinks: { href: string; label: string; icon: typeof Sparkles; hint: string }[] = [
  { href: "/ai-secretary", label: "AI 비서", icon: Sparkles, hint: "대화로 일정·업무 처리" },
  { href: "/ai-hub", label: "AI 허브", icon: BrainCircuit, hint: "모델·프롬프트 설정" },
];

const workGroupLinks: NavLink[] = [
  { href: "/tasks", label: "Projects", icon: ListTodo, featureKey: "tasks" },
  { href: "/trash", label: "휴지통", icon: Trash2, featureKey: "tasks", hint: "삭제된 프로젝트" },
];

// [인사/일정 관리]: 인디고/블루 계열
const hrGroupLinks: {
  href: string;
  label: string;
  icon: typeof Calendar;
  featureKey?: string;
  companyOnly?: boolean;
  awayOverviewOnly?: boolean;
  csAccessOnly?: boolean;
}[] = [
  { href: "/schedule", label: "스케줄", icon: Calendar, featureKey: "schedule" },
  { href: "/leave", label: "연차/근태", icon: CalendarClock, featureKey: "leave", companyOnly: true },
];

// [재무/영업 관리]: 에메랄드/그린 계열
const financeGroupLinks: { href: string; label: string; icon: typeof Wallet; featureKey?: string }[] = [
  { href: "/finance/requests", label: "자금 관리", icon: Wallet, featureKey: "finance_view" },
  { href: "/quotations", label: "견적서", icon: FileText, featureKey: "quotations" },
];

/** 관리 드롭다운: 대표는 전부, 그 외는 기능 권한(예: 팀장 admin_logs → Daily Report만) */
const ADMIN_MENU_DEFS: {
  href: string;
  label: string;
  icon: typeof Settings;
  executiveOnly?: boolean;
  /** 마스터 계정 전용(감사용 화면). 대표/관리자에게도 숨김 */
  masterOnly?: boolean;
  feature?: string;
  /** 대표·관리자 + CS 팀장/센터장 */
  csLeaveOverview?: boolean;
}[] = [
  { href: "/admin", label: "관리 홈", icon: Settings, executiveOnly: true },
  { href: "/admin/employees", label: "직원 관리", icon: Users, feature: "admin_employees" },
  { href: "/admin/employee-leave-summary", label: "직원 연차 현황", icon: CalendarClock, csLeaveOverview: true },
  { href: "/admin/attendance-import", label: "근태 기록 가져오기", icon: Upload, feature: "attendance_import" },
  { href: "/admin/attendance", label: "월별 근태", icon: CalendarClock, feature: "attendance_import" },
  { href: "/admin/permissions", label: "기능 권한", icon: Shield, executiveOnly: true },
  { href: "/admin/logs", label: "Daily Report 조회", icon: FileText, feature: "admin_logs" },
  { href: "/admin/departments-positions", label: "부서·직책", icon: Layers, feature: "admin_departments" },
  { href: "/admin/projects", label: "브랜드/프로젝트", icon: FolderKanban, feature: "admin_projects" },
  { href: "/admin/trash", label: "삭제된 항목", icon: Trash2, masterOnly: true },
  { href: "/admin/company", label: "회사 정보", icon: Building2, feature: "admin_company" },
  { href: "/drive/trash", label: "드라이브 휴지통", icon: HardDrive, executiveOnly: true },
  { href: "/drive/activity", label: "드라이브 이력", icon: FileText, executiveOnly: true },
  { href: "/admin/drive-shares", label: "드라이브 팀 공유", icon: HardDrive, executiveOnly: true },
  { href: "/admin/settings/logo", label: "로고 설정", icon: Image, executiveOnly: true },
];

export function AppNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { mutate: swrMutate } = useSWRConfig();
  const { logoUrl, setLogoUrl } = useLayoutShared();
  const currentWorkspace = useWorkspaceStore((s: any) => s.currentWorkspace);
  const urlMode = useWorkspaceStore((s: any) => s.urlSearchMode);
  const [paymentAlertCount, setPaymentAlertCount] = useState(0);
  const [paymentAlertLabel, setPaymentAlertLabel] = useState<string>("알림");
  /** [PERF-3차] 모드는 UrlSearchModeBridge·WorkspaceThemeSync·영속 스토어와 정렬 — /api/mode GET 제거 */
  const effectiveMode: "company" | "personal" =
    urlMode === "MY"
      ? "personal"
      : urlMode === "TEAM"
        ? "company"
        : currentWorkspace === "MY"
          ? "personal"
          : "company";

  useEffect(() => {
    if (!session?.user || pathname === "/login" || pathname === "/choose-mode") return;
    // [PERF-mode-logo] 로고 변경 시에만 1회 네트워크 — SWR 캐시 동기화로 이후 중복 방지
    const load = async () => {
      try {
        const res = await fetch(SWR_LOGO_SETTINGS_KEY);
        const d: LogoSettingsApiPayload = res.ok
          ? ((await res.json()) as LogoSettingsApiPayload)
          : { logoUrl: null };
        setLogoUrl(d.logoUrl ?? null);
        await swrMutate(SWR_LOGO_SETTINGS_KEY, d, { revalidate: false });
      } catch {
        setLogoUrl(null);
        await swrMutate(SWR_LOGO_SETTINGS_KEY, { logoUrl: null }, { revalidate: false });
      }
    };
    window.addEventListener("logo-updated", load);
    return () => window.removeEventListener("logo-updated", load);
  }, [session?.user, pathname, setLogoUrl, swrMutate]);

  const userForPermissionForBadge = session?.user as { role?: string; permissions?: string | null } | undefined;
  const canChatForBadge = (() => {
    try {
      return userForPermissionForBadge ? userHasPermission(userForPermissionForBadge as any, "chat") : true;
    } catch {
      return true;
    }
  })();

  const chatsBadgeEnabled =
    Boolean(session?.user?.id) &&
    pathname !== "/choose-mode" &&
    pathname !== "/login" &&
    effectiveMode === "company" &&
    canChatForBadge;

  const { data: unreadChat, mutate: mutateUnreadChat } = useSWR<{ count: number }>(
    chatsBadgeEnabled ? "/api/chats/unread-count" : null,
    jsonFetcher,
    {
      dedupingInterval: 30_000,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  useEffect(() => {
    if (!chatsBadgeEnabled) return;
    let debounceT: ReturnType<typeof setTimeout> | null = null;
    const onInbox = () => {
      if (debounceT) clearTimeout(debounceT);
      debounceT = setTimeout(() => {
        debounceT = null;
        void mutateUnreadChat();
      }, 400);
    };
    const onRead = () => void mutateUnreadChat();
    window.addEventListener("chat-inbox-refresh", onInbox);
    window.addEventListener("chat-read", onRead);
    return () => {
      window.removeEventListener("chat-inbox-refresh", onInbox);
      window.removeEventListener("chat-read", onRead);
      if (debounceT) clearTimeout(debounceT);
    };
  }, [chatsBadgeEnabled, mutateUnreadChat]);

  const financeBadgeEnabled =
    pathname !== "/choose-mode" && effectiveMode === "company" && Boolean(session?.user?.id);

  const { data: financeBadge, mutate: mutateFinance } = useSWR<{ count: number; label: string }>(
    financeBadgeEnabled ? SWR_KEYS.financeAlertsCount : null,
    jsonFetcher,
    { dedupingInterval: 120_000, revalidateOnFocus: true }
  );

  const tasksBadgeEnabled =
    Boolean(session?.user?.id) &&
    pathname !== "/choose-mode" &&
    pathname !== "/login";

  const userForTasksBadge = session?.user as { role?: string; permissions?: string | null } | undefined;
  const canTasksForBadge = (() => {
    try {
      return userForTasksBadge ? userHasPermission(userForTasksBadge as any, "tasks") : true;
    } catch {
      return true;
    }
  })();

  const { data: tasksAssignedBadge, mutate: mutateTasksAssignedBadge } = useSWR<{ count: number }>(
    tasksBadgeEnabled && canTasksForBadge ? SWR_KEYS.tasksAssignedNewCount : null,
    jsonFetcher,
    {
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      revalidateOnMount: true,
    }
  );

  const projectAssignBadgeCount = tasksAssignedBadge?.count ?? 0;
  const chatUnreadCount = unreadChat?.count ?? 0;

  const userForBoardBadge = session?.user as { role?: string; permissions?: string | null } | undefined;
  const canBoardForBadge = (() => {
    try {
      return userForBoardBadge ? userHasPermission(userForBoardBadge as any, "board") : true;
    } catch {
      return true;
    }
  })();

  const boardBadgeEnabled =
    Boolean(session?.user?.id) &&
    pathname !== "/choose-mode" &&
    pathname !== "/login" &&
    effectiveMode === "company" &&
    canBoardForBadge;

  const [boardLastSeenForSwr, setBoardLastSeenForSwr] = useState<string | null>(null);

  useEffect(() => {
    if (!boardBadgeEnabled) return;
    if (typeof window === "undefined") return;
    const baseline = ensureBoardLastSeenBaseline();
    queueMicrotask(() => setBoardLastSeenForSwr(baseline));
    const onSeen = () => {
      queueMicrotask(() =>
        setBoardLastSeenForSwr(readBoardLastSeenIso() ?? new Date().toISOString())
      );
    };
    window.addEventListener(BOARD_LAST_SEEN_EVENT, onSeen);
    return () => window.removeEventListener(BOARD_LAST_SEEN_EVENT, onSeen);
  }, [boardBadgeEnabled]);

  const boardNewCountUrl =
    boardBadgeEnabled && boardLastSeenForSwr
      ? `/api/board/new-count?since=${encodeURIComponent(boardLastSeenForSwr)}`
      : null;

  const { data: boardNewBadge, mutate: mutateBoardNewBadge } = useSWR<{ count: number }>(
    boardNewCountUrl,
    jsonFetcher,
    {
      dedupingInterval: 45_000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  );

  const boardNewCount = boardNewBadge?.count ?? 0;

  useEffect(() => {
    if (!boardBadgeEnabled) return;
    const onNewPost = () => void mutateBoardNewBadge();
    window.addEventListener(BOARD_NEW_POST_EVENT, onNewPost);
    return () => window.removeEventListener(BOARD_NEW_POST_EVENT, onNewPost);
  }, [boardBadgeEnabled, mutateBoardNewBadge]);

  useEffect(() => {
    if (!financeBadgeEnabled) {
      setPaymentAlertCount(0);
      setPaymentAlertLabel("알림");
      return;
    }
    if (financeBadge) {
      setPaymentAlertCount(financeBadge.count ?? 0);
      setPaymentAlertLabel(financeBadge.label ?? "알림");
    }
  }, [financeBadge, financeBadgeEnabled]);

  useEffect(() => {
    if (!financeBadgeEnabled) return;
    const onFin = () => void mutateFinance();
    window.addEventListener("finance-alerts-refresh", onFin);
    return () => window.removeEventListener("finance-alerts-refresh", onFin);
  }, [financeBadgeEnabled, mutateFinance]);

  useEffect(() => {
    if (!tasksBadgeEnabled || !canTasksForBadge) return;
    const onNotif = () => void mutateTasksAssignedBadge();
    window.addEventListener("notification-realtime", onNotif);
    return () => window.removeEventListener("notification-realtime", onNotif);
  }, [tasksBadgeEnabled, canTasksForBadge, mutateTasksAssignedBadge]);

  if (pathname === "/login" || pathname === "/choose-mode") return null;

  const isCompany = effectiveMode === "company";
  const isExecutive = session?.user?.role === "EXECUTIVE" || session?.user?.role === "ADMIN";
  const isTeamLead = session?.user?.role === "TEAM_LEAD";
  const isMaster = isMasterEmail(session?.user?.email);
  const orgUnit = resolveOrgUnit({
    role: session?.user?.role,
    department: session?.user?.department,
  });
  const canSeeCsTools = canSeeCsToolsDashboardCard({
    role: session?.user?.role,
    department: session?.user?.department,
  });
  const homePath = homePathForOrg(orgUnit);
  const isHqOrg = orgUnit === "HQ";
  const canManageEmployees = canManageEmployeesSync({
    role: session?.user?.role,
    position: session?.user?.position,
  });

  const userForPermission = session?.user as { role?: string; permissions?: string | null } | undefined;
  const can = (featureKey: string) => {
    try {
      return userForPermission ? userHasPermission(userForPermission as any, featureKey) : true;
    } catch {
      return true;
    }
  };

  const visibleNav = (links: NavLink[]) =>
    links.filter(
      (l) =>
        (!l.featureKey || can(l.featureKey)) &&
        (!l.companyOnly || isCompany) &&
        (!l.csAccessOnly || canSeeCsTools) &&
        navHrefAllowedForOrg(l.href, orgUnit)
    );

  const mainLinks = visibleNav(mainGroupLinks);
  const workLinks = visibleNav(workGroupLinks);
  const resourceLinks = visibleNav(resourceGroupLinks);
  const commsLinks = visibleNav(commsGroupLinks);
  const aiActive = aiGroupLinks.some(
    (l) => pathname === l.href || pathname.startsWith(l.href + "/")
  );
  const resourceActive = resourceLinks.some(
    (l) => pathname === l.href || pathname.startsWith(l.href + "/")
  );
  const commsActive = commsLinks.some(
    (l) => pathname === l.href || pathname.startsWith(l.href + "/")
  );
  const workActive = workLinks.some(
    (l) => pathname === l.href || pathname.startsWith(l.href + "/")
  );
  const canSeeAwayOverview = canViewAwayOverview({
    role: session?.user?.role,
    department: session?.user?.department,
  });

  const canManageClients = canManageCsClients({
    role: session?.user?.role,
    department: session?.user?.department,
  });
  const csNavItems = csSectionNavItems({
    canManageClients,
    canViewAwayOverview: canSeeAwayOverview,
  });
  const onCsSection = isCsSectionPath(pathname);
  const showCsSectionNav = canSeeCsTools && onCsSection;
  const hrLinks = hrGroupLinks.filter(
    (l: any) =>
      (!l.featureKey || can(l.featureKey)) &&
      (!l.companyOnly || isCompany) &&
      (!l.awayOverviewOnly || canSeeAwayOverview) &&
      (!l.csAccessOnly || canSeeCsTools) &&
      navHrefAllowedForOrg(l.href, orgUnit)
  );
  const financeLinks = financeGroupLinks.filter(
    (l: any) => (!l.featureKey || can(l.featureKey)) && navHrefAllowedForOrg(l.href, orgUnit)
  );

  const adminLinks = ADMIN_MENU_DEFS.filter((d) => {
    if (!navHrefAllowedForOrg(d.href, orgUnit) && !(orgUnit === "LOGISTICS" && d.href === "/admin/company")) {
      return false;
    }
    if (d.masterOnly) return isMaster;
    if (d.csLeaveOverview) {
      return canViewEmployeeLeaveSummary({
        role: session?.user?.role,
        department: session?.user?.department,
      });
    }
    if (d.executiveOnly) return isExecutive;
    if (d.feature) {
      if (orgUnit === "LOGISTICS" && d.href === "/admin/company") return true;
      if (d.feature === "admin_employees" && canManageEmployees) return true;
      return isExecutive || can(d.feature);
    }
    return isExecutive;
  }).map(({ href, label, icon }) => ({ href, label, icon }));

  const roleLabel =
    session?.user?.role === "CENTER_CHIEF"
      ? "센터장"
      : session?.user?.role === "TEAM_LEAD"
        ? "팀장"
        : session?.user?.role === "EXECUTIVE" || session?.user?.role === "ADMIN"
          ? "대표"
          : session?.user
            ? "직원"
            : null;

  const badgePreset = (session?.user as { badgePreset?: string | null } | undefined)?.badgePreset ?? "default";

  const avatarClass = (() => {
    if (badgePreset === "violet") return "bg-gradient-to-br from-violet-500 to-indigo-600 text-white";
    if (badgePreset === "amber") return "bg-gradient-to-br from-amber-400 to-orange-500 text-white";
    if (badgePreset === "emerald") return "bg-gradient-to-br from-emerald-500 to-teal-600 text-white";
    if (badgePreset === "blue") return "bg-gradient-to-br from-blue-500 to-indigo-500 text-white";
    return isExecutive
      ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white"
      : isTeamLead
        ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white"
        : "bg-gray-100 text-gray-700";
  })();

  const badgeClass = (() => {
    if (badgePreset === "violet") return "bg-violet-100 text-violet-700";
    if (badgePreset === "amber") return "bg-amber-100 text-amber-700";
    if (badgePreset === "emerald") return "bg-emerald-100 text-emerald-700";
    if (badgePreset === "blue") return "bg-blue-100 text-blue-700";
    return isExecutive
      ? "bg-violet-100 text-violet-700"
      : isTeamLead
        ? "bg-amber-100 text-amber-700"
        : "bg-gray-100 text-gray-700";
  })();

  const userInitial = (session?.user?.name ?? session?.user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: 로고(또는 아이콘) + 서비스명 COMPLETE CRM */}
        <div className="flex items-center gap-2 sm:gap-3">
          <HistoryNavButtons className="shrink-0" />
          <Link
            href={homePath}
            prefetch={false}
            className="flex items-center gap-2 font-bold text-gray-900 transition-colors hover:text-violet-600"
          >
            {logoUrl ? (
              <NextImage
                src={logoUrl}
                alt="COMPLETE CRM"
                width={140}
                height={32}
                className="h-8 w-auto max-w-[140px] object-contain"
                unoptimized
              />
            ) : (
              <NextImage
                src="/icons/icon-192x192.png"
                alt="COMPLETE CRM"
                width={32}
                height={32}
                className="size-8 shrink-0 rounded-lg object-contain shadow-sm"
                priority
              />
            )}
            <span className="hidden sm:inline">COMPLETE CRM</span>
            {!logoUrl && (
              <span className="hidden text-sm font-normal text-gray-500 sm:inline">COMPLETE CRM</span>
            )}
          </Link>
        </div>

        {/* Center: 네비게이션 */}
        <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {/* 대시보드 단일 버튼 */}
          {isHqOrg && (
          <Button variant="ghost" asChild className={cn("flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200", pathname === "/dashboard" || pathname.startsWith("/dashboard/") ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")}>
            <Link href="/dashboard" prefetch={false} className="flex items-center gap-1.5">
              <LayoutDashboard className="size-4" />
              <span>대시보드</span>
            </Link>
          </Button>
          )}

          {/* Projects + 휴지통 */}
          {workLinks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200",
                    workActive
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <span className="relative inline-flex">
                    <ListTodo className="size-4" />
                    {projectAssignBadgeCount > 0 && (
                      <span className="absolute -right-2 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                        {projectAssignBadgeCount > 99 ? "99+" : projectAssignBadgeCount}
                      </span>
                    )}
                  </span>
                  <span>Projects</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                <DropdownMenuLabel className="text-muted-foreground text-xs">프로젝트</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {workLinks.map(({ href, label, icon: Icon, hint }) => {
                  const isActive = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <DropdownMenuItem key={href} asChild>
                      <Link
                        href={href}
                        prefetch={false}
                        className={cn(
                          "flex cursor-pointer items-start gap-2",
                          isActive && "bg-gray-100 text-gray-900"
                        )}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0" />
                        <span className="flex flex-col">
                          <span>{label}</span>
                          {hint && (
                            <span className="text-muted-foreground text-[11px]">{hint}</span>
                          )}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* 자료: 게시판·파일·NAS */}
          {resourceLinks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200",
                    resourceActive
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <span className="relative inline-flex shrink-0">
                    <FolderOpen className="size-4" />
                    {boardNewCount > 0 && (
                      <span className="absolute -right-2 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                        {boardNewCount > 99 ? "99+" : boardNewCount}
                      </span>
                    )}
                  </span>
                  <span>자료</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-52">
                <DropdownMenuLabel className="text-muted-foreground text-xs">자료</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {resourceLinks.map(({ href, label, icon: Icon, hint }) => {
                  const isActive = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <DropdownMenuItem key={href} asChild>
                      <Link
                        href={href}
                        prefetch={false}
                        className={cn(
                          "flex cursor-pointer items-start gap-2",
                          isActive && "bg-gray-100 text-gray-900"
                        )}
                      >
                        <span className="relative mt-0.5 inline-flex shrink-0">
                          <Icon className="size-4" />
                          {href === "/board" && boardNewCount > 0 && (
                            <span className="absolute -right-2 -top-2 flex min-h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white">
                              {boardNewCount > 99 ? "99+" : boardNewCount}
                            </span>
                          )}
                        </span>
                        <span className="flex flex-col">
                          <span>{label}</span>
                          {hint && (
                            <span className="text-muted-foreground text-[11px]">{hint}</span>
                          )}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* CS 링크 — 진입만. 공지·라운지·업체는 CS 구역 상단 메뉴 */}
          {mainLinks.some((l) => l.href === "/cs-tools") && (
            <Button
              variant="ghost"
              asChild
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200",
                onCsSection
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Link href="/cs-tools" prefetch={false} className="flex items-center gap-1.5">
                <Link2 className="size-4" />
                <span>CS 링크</span>
              </Link>
            </Button>
          )}

          {/* 3PL 물류 — 단독 (도약패키지 연동 예정) */}
          {mainLinks.some((l) => l.href === "/logistics") && (
            <Button
              variant="ghost"
              asChild
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200",
                pathname === "/logistics" || pathname.startsWith("/logistics/")
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Link href="/logistics" prefetch={false} className="flex items-center gap-1.5">
                <Package className="size-4" />
                <span>3PL</span>
              </Link>
            </Button>
          )}

          {/* 소통: 공지·채팅 */}
          {commsLinks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200",
                    commsActive
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <span className="relative inline-flex shrink-0">
                    <MessageCircle className="size-4" />
                    {chatUnreadCount > 0 && (
                      <span className="absolute -right-2 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                        {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                      </span>
                    )}
                  </span>
                  <span>소통</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-52">
                <DropdownMenuLabel className="text-muted-foreground text-xs">소통</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {commsLinks.map(({ href, label, icon: Icon, hint }) => {
                  const isActive = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <DropdownMenuItem key={href} asChild>
                      <Link
                        href={href}
                        prefetch={false}
                        className={cn(
                          "flex cursor-pointer items-start gap-2",
                          isActive && "bg-gray-100 text-gray-900"
                        )}
                      >
                        <span className="relative mt-0.5 inline-flex shrink-0">
                          <Icon className="size-4" />
                          {href === "/chat" && chatUnreadCount > 0 && (
                            <span className="absolute -right-2 -top-2 flex min-h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white">
                              {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                            </span>
                          )}
                        </span>
                        <span className="flex flex-col">
                          <span>{label}</span>
                          {hint && (
                            <span className="text-muted-foreground text-[11px]">{hint}</span>
                          )}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* [AI] - 비서·허브 */}
          {isHqOrg && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200",
                  aiActive
                    ? "bg-gray-100 text-gray-900"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Sparkles className="size-4" />
                <span>AI</span>
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-52">
              <DropdownMenuLabel className="text-muted-foreground text-xs">AI 기능</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {aiGroupLinks.map(({ href, label, icon: Icon, hint }) => {
                const isActive = pathname === href || pathname.startsWith(href + "/");
                return (
                  <DropdownMenuItem key={href} asChild>
                    <Link
                      href={href}
                      prefetch={false}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 transition-colors",
                        isActive && "bg-gray-100 text-gray-900"
                      )}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0" />
                      <span className="flex flex-col">
                        <span>{label}</span>
                        <span className="text-muted-foreground text-[11px]">{hint}</span>
                      </span>
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          )}

          {/* [인사/일정 관리] - 인디고/블루 */}
          {hrLinks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200",
                    hrLinks.some((l: any) => pathname === l.href || pathname.startsWith(l.href + "/"))
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-indigo-600/90 hover:bg-indigo-50 hover:text-indigo-700"
                  )}
                >
                  <Calendar className="size-4" />
                  <span>인사/일정</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-44">
                <DropdownMenuLabel className="text-xs text-indigo-600">인사/일정 관리</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {hrLinks.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <DropdownMenuItem key={href} asChild>
                      <Link
                        href={href}
                        className={cn(
                          "flex items-center gap-2 cursor-pointer transition-colors",
                          isActive && "bg-indigo-50 text-indigo-700"
                        )}
                      >
                        <Icon className="size-4" />
                        {label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* [재무/영업 관리] - 에메랄드/그린 */}
          {financeLinks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200",
                    financeLinks.some((l: any) => pathname === l.href || pathname.startsWith(l.href + "/"))
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-emerald-600/90 hover:bg-emerald-50 hover:text-emerald-700"
                  )}
                >
                  <Wallet className="size-4" />
                  <span>재무/영업</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-44">
                <DropdownMenuLabel className="text-xs text-emerald-600">재무/영업 관리</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {financeLinks.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <DropdownMenuItem key={href} asChild>
                      <Link
                        href={href}
                        prefetch={false}
                        className={cn(
                          "flex items-center gap-2 cursor-pointer transition-colors",
                          isActive && "bg-emerald-50 text-emerald-700"
                        )}
                      >
                        <Icon className="size-4" />
                        {label}
                        {href === "/finance/requests" && paymentAlertCount > 0 && (
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            <span className="opacity-90">{paymentAlertLabel}</span>
                            <span>{paymentAlertCount > 99 ? "99+" : paymentAlertCount}</span>
                          </span>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Admin Dropdown (for executives) */}
          {adminLinks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200",
                    adminLinks.some((l: any) => pathname.startsWith(l.href))
                      ? "bg-violet-50 text-violet-700"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <Settings className="size-4" />
                  <span>관리</span>
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                <DropdownMenuLabel className="text-xs text-gray-500">관리자 메뉴</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {adminLinks.map(({ href, label, icon: Icon }) => (
                  <DropdownMenuItem key={href} asChild>
                    <Link
                      href={href}
                      prefetch={false}
                      className={cn(
                        "flex items-center gap-2 cursor-pointer",
                        pathname === href && "bg-violet-50 text-violet-700"
                      )}
                    >
                      <Icon className="size-4" />
                      {label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>

        {/* Right: 워크스페이스 토글 + 알림 + 사용자 메뉴(이름 클릭 시 로그아웃 등) */}
        <div className="flex items-center gap-2 sm:gap-3">
          {isHqOrg && <WorkspaceSwitcher />}
          <NotificationBell />

          {/* User Dropdown (프로필/내 정보/로그아웃) */}
          {session?.user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 rounded-full p-1.5 hover:bg-gray-100"
                  aria-label="메뉴"
                >
                  <Avatar className="size-8 border-2 border-white shadow-sm">
                    <AvatarFallback className={cn("text-sm font-semibold", avatarClass)}>
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden flex-col items-start text-left lg:flex">
                    <span className="text-sm font-medium text-gray-900">
                      {session?.user?.name ?? "사용자"}
                    </span>
                    {roleLabel && (
                      <span className="text-xs text-gray-500">{roleLabel}</span>
                    )}
                  </div>
                  <ChevronDown className="hidden size-4 text-gray-400 lg:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{session?.user?.name ?? session?.user?.email ?? ""}</p>
                    <p className="text-xs text-gray-500">{session?.user?.email ?? ""}</p>
                    {roleLabel && (
                      <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium", badgeClass)}>
                        {roleLabel}
                      </span>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" prefetch={false} className="flex items-center gap-2 cursor-pointer">
                    <User className="size-4" />
                    내 정보
                  </Link>
                </DropdownMenuItem>
                {isHqOrg && (
                <DropdownMenuItem asChild>
                  <Link href="/my-project" prefetch={false} className="flex items-center gap-2 cursor-pointer">
                    <FolderKanban className="size-4" />
                    내 프로젝트
                  </Link>
                </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await onesignalOptOutAndDeregister();
                    await signOut({ callbackUrl: "/login" });
                  }}
                  className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-600"
                >
                  <LogOut className="size-4" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {showCsSectionNav && (
        <Suspense fallback={null}>
          <CsSectionNav items={csNavItems} />
        </Suspense>
      )}

      {/* Mobile Navigation (shown below header on small screens) */}
      <div className="flex overflow-x-auto border-t border-gray-100 bg-white px-4 py-2 md:hidden">
        <div className="flex gap-1">
          {mainLinks.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/cs-tools"
                ? onCsSection
                : pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                prefetch={false}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                  isActive ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
          {[
            ...workLinks,
            ...resourceLinks,
            ...commsLinks,
            ...(isHqOrg ? aiGroupLinks : []),
            ...hrLinks,
            ...financeLinks,
          ].map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            const isHr = hrLinks.some((l: any) => l.href === href);
            const isFinance = financeLinks.some((l: any) => l.href === href);
            return (
              <Link
                key={href}
                href={href}
                prefetch={false}
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all",
                  isActive
                    ? isHr
                      ? "bg-indigo-50 text-indigo-700"
                      : isFinance
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-900"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Icon className="size-4" />
                {label}
                {href === "/board" && boardNewCount > 0 && (
                  <span className="ml-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                    {boardNewCount > 99 ? "99+" : boardNewCount}
                  </span>
                )}
                {href === "/chat" && chatUnreadCount > 0 && (
                  <span className="ml-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                    {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                  </span>
                )}
                {href === "/tasks" && projectAssignBadgeCount > 0 && (
                  <span className="ml-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                    {projectAssignBadgeCount > 99 ? "99+" : projectAssignBadgeCount}
                  </span>
                )}
                {href === "/finance/requests" && paymentAlertCount > 0 && (
                  <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    <span>{paymentAlertLabel}</span>
                    <span>{paymentAlertCount > 99 ? "99+" : paymentAlertCount}</span>
                  </span>
                )}
              </Link>
            );
          })}
          {adminLinks.length > 0 && (
            <Link
              href={adminLinks[0]?.href ?? "/admin"}
              prefetch={false}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium",
                pathname.startsWith("/admin")
                  ? "bg-violet-50 text-violet-700"
                  : "text-gray-500 hover:bg-gray-100"
              )}
            >
              <Settings className="size-4" />
              관리
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

