"use client";

import Link from "next/link";
import { UnifiedNavigation } from "./unified-navigation";
import { workspaceAreas, WORKSPACE_OWNER } from "../lib/workspace-areas";
import NextImage from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { jsonFetcher, SWR_KEYS, SWR_LOGO_SETTINGS_KEY } from "@/lib/api-swr";
import type { LogoSettingsApiPayload } from "@/lib/header-bootstrap";
import { useWorkspaceStore, type WorkspaceState } from "@/store/workspace-store";
import { onesignalOptOutAndDeregister } from "@/lib/onesignal/client-logout";
import {
  Calendar,
  ListTodo,
  ListOrdered,
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
  Server,
  Upload,
} from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useLayoutShared } from "@/components/layout-shared-context";
import { cn } from "@/lib/utils";
import { hasFinancePageAccess, userHasPermission } from "@/lib/permissions";
import { hasDailyReportMenuAccess } from "@/lib/work-log-access";
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
  /** 이 중 하나라도 있으면 메뉴 표시 (자금 조회 vs 자금 요청) */
  anyFeatureKeys?: string[];
  companyOnly?: boolean;
  hint?: string;
  awayOverviewOnly?: boolean;
  csAccessOnly?: boolean;
};

// [메인]: 대시보드·CS·3PL (자주 쓰는 단일 진입)


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
  { href: "/stages", label: "단계 현황", icon: ListOrdered, featureKey: "tasks", companyOnly: true, hint: "프로젝트 단계·담당자 진행" },
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
const financeGroupLinks: {
  href: string;
  label: string;
  icon: typeof Wallet;
  featureKey?: string;
  anyFeatureKeys?: string[];
}[] = [
  { href: "/finance/requests", label: "자금 관리", icon: Wallet, anyFeatureKeys: ["finance_view", "finance_request"] },
  { href: "/quotations", label: "견적서", icon: FileText, featureKey: "quotations" },
];

/** 관리 드롭다운: 대표는 전부, 그 외는 기능 권한 */
const ADMIN_MENU_DEFS: {
  href: string;
  label: string;
  icon: typeof Settings;
  executiveOnly?: boolean;
  /** 마스터 계정 전용(감사용 화면). 대표/관리자에게도 숨김 */
  masterOnly?: boolean;
  feature?: string;
  /** Daily Report 조회(사원급/팀장급 권한 병렬) */
  dailyReport?: boolean;
  /** 대표·관리자 + CS 팀장/센터장 */
  csLeaveOverview?: boolean;
}[] = [
  { href: "/admin", label: "관리 홈", icon: Settings, executiveOnly: true },
  { href: "/admin/employees", label: "직원 관리", icon: Users, feature: "employee_manage" },
  { href: "/admin/employee-leave-summary", label: "직원 연차 현황", icon: CalendarClock, csLeaveOverview: true },
  { href: "/admin/attendance-import", label: "근태 기록 가져오기", icon: Upload, feature: "attendance_import" },
  { href: "/admin/attendance", label: "월별 근태", icon: CalendarClock, feature: "attendance_import" },
  { href: "/admin/permissions", label: "기능 권한", icon: Shield, executiveOnly: true },
  { href: "/admin/logs", label: "Daily Report 조회", icon: FileText, dailyReport: true },
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
  const currentWorkspace = useWorkspaceStore((s: WorkspaceState) => s.currentWorkspace);
  const urlMode = useWorkspaceStore((s: WorkspaceState) => s.urlSearchMode);
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
      return userForPermissionForBadge ? userHasPermission({ ...userForPermissionForBadge, role: userForPermissionForBadge.role ?? "USER" }, "chat") : true;
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
      return userForTasksBadge ? userHasPermission({ ...userForTasksBadge, role: userForTasksBadge.role ?? "USER" }, "tasks") : true;
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
      return userForBoardBadge ? userHasPermission({ ...userForBoardBadge, role: userForBoardBadge.role ?? "USER" }, "board") : true;
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

  const paymentAlertCount = financeBadgeEnabled ? (financeBadge?.count ?? 0) : 0;


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
    permissionsJson: (session?.user as { permissions?: string | null } | undefined)?.permissions ?? null,
  });

  const userForPermission = session?.user as { role?: string; permissions?: string | null } | undefined;
  const can = (featureKey: string) => {
    try {
      return userForPermission ? userHasPermission({ ...userForPermission, role: userForPermission.role ?? "USER" }, featureKey) : true;
    } catch {
      return true;
    }
  };
  const canSeeLink = (l: { featureKey?: string; anyFeatureKeys?: string[]; href?: string }) => {
    if (l.href === "/finance/requests") {
      return userForPermission ? hasFinancePageAccess(userForPermission) : true;
    }
    if (l.anyFeatureKeys && l.anyFeatureKeys.length > 0) {
      return l.anyFeatureKeys.some((k) => can(k));
    }
    return !l.featureKey || can(l.featureKey);
  };

  const visibleNav = (links: NavLink[]) =>
    links.filter(
      (l) =>
        canSeeLink(l) &&
        (!l.companyOnly || isCompany) &&
        (!l.csAccessOnly || canSeeCsTools) &&
        navHrefAllowedForOrg(l.href, orgUnit)
    );


  const workLinks = visibleNav(workGroupLinks);
  if (session?.user?.id === "cmmitn4830000fc0jt8c1l2jf") workLinks.unshift({ href: "/rua-project", label: "루와의 프로젝트", icon: FolderKanban, hint: "대표 개인 기록" });
  workLinks.unshift({ href: "/workspaces", label: "업무영역", icon: FolderKanban, hint: "경영지원 · 마케팅 · CS · 3PL" });
  const resourceLinks = visibleNav(resourceGroupLinks);
  const commsLinks = visibleNav(commsGroupLinks);
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
    (l: NavLink) =>
      canSeeLink(l) &&
      (!l.companyOnly || isCompany) &&
      (!l.awayOverviewOnly || canSeeAwayOverview) &&
      (!l.csAccessOnly || canSeeCsTools) &&
      navHrefAllowedForOrg(l.href, orgUnit)
  );
  const financeLinks = financeGroupLinks.filter(
    (l: NavLink) => canSeeLink(l) && navHrefAllowedForOrg(l.href, orgUnit)
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
    if (d.dailyReport) {
      return hasDailyReportMenuAccess({
        role: session?.user?.role,
        permissions: (session?.user as { permissions?: string | null } | undefined)?.permissions ?? null,
      });
    }
    if (d.executiveOnly) return isExecutive;
    if (d.feature) {
      if (orgUnit === "LOGISTICS" && d.href === "/admin/company") return true;
      if (d.feature === "employee_manage" && canManageEmployees) return true;
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
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
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
          </Link>
        </div>

        {/* Center: 네비게이션 */}


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

      <UnifiedNavigation pathname={pathname} areas={session?.user?.id?workspaceAreas({id:session.user.id,department:session.user.department}):[]} dashboard={isHqOrg} groups={[
        {label:"프로젝트",links:workLinks.filter(l=>l.href!=="/rua-project"&&l.href!=="/workspaces").map(l=>({...l,count:l.href==="/tasks"?projectAssignBadgeCount:0}))},
        {label:"내 업무",links:session?.user?.id===WORKSPACE_OWNER?[{href:"/rua-project",label:"루와의 프로젝트",hint:"대표 전용 개인 기록"}]:[]},
        {label:"자료",links:resourceLinks.map(l=>({...l,count:l.href==="/board"?boardNewCount:0}))},
        {label:"소통",links:commsLinks.map(l=>({...l,count:l.href==="/chat"?chatUnreadCount:0}))},
        {label:"AI",links:isHqOrg?aiGroupLinks:[]},
        {label:"인사·일정",links:hrLinks},
        {label:"재무·영업",links:financeLinks.map(l=>({...l,count:l.href==="/finance/requests"?paymentAlertCount:0}))},
        {label:"관리",links:adminLinks}
      ]}/>
      {showCsSectionNav && (
        <Suspense fallback={null}>
          <CsSectionNav items={csNavItems} />
        </Suspense>
      )}

    </header>
  );
}

