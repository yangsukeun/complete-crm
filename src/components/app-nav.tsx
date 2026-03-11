"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useWorkspaceStore } from "@/store/workspace-store";
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
  Command,
  Megaphone,
  Image,
  FolderOpen,
} from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { cn } from "@/lib/utils";
import { userHasPermission } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// [메인]: 대시보드 (+ 공지·채팅 회사 모드 시)
const mainGroupLinks: { href: string; label: string; icon: typeof LayoutDashboard; featureKey?: string; companyOnly?: boolean }[] = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard, featureKey: "dashboard" },
  { href: "/announcements", label: "공지사항", icon: Megaphone, featureKey: "announcements", companyOnly: true },
  { href: "/board", label: "게시판", icon: FolderOpen, featureKey: "board", companyOnly: true },
  { href: "/chat", label: "채팅", icon: MessageCircle, featureKey: "chat", companyOnly: true },
];

// [업무]
const workGroupLinks: { href: string; label: string; icon: typeof ListTodo; featureKey?: string }[] = [
  { href: "/tasks", label: "업무", icon: ListTodo, featureKey: "tasks" },
];

// [인사/일정 관리]: 인디고/블루 계열
const hrGroupLinks: { href: string; label: string; icon: typeof Calendar; featureKey?: string; companyOnly?: boolean }[] = [
  { href: "/schedule", label: "스케줄", icon: Calendar, featureKey: "schedule" },
  { href: "/leave", label: "연차/근태", icon: CalendarClock, featureKey: "leave", companyOnly: true },
];

// [재무/영업 관리]: 에메랄드/그린 계열
const financeGroupLinks: { href: string; label: string; icon: typeof Wallet; featureKey?: string }[] = [
  { href: "/finance/requests", label: "자금 관리", icon: Wallet, featureKey: "finance_view" },
  { href: "/quotations", label: "견적서", icon: FileText, featureKey: "quotations" },
];

const CHAT_READ_KEY = "chat_read_";

export function AppNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const currentWorkspace = useWorkspaceStore((s: any) => s.currentWorkspace);
  const [mode, setMode] = useState<"company" | "personal" | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [paymentAlertCount, setPaymentAlertCount] = useState(0);
  const [paymentAlertLabel, setPaymentAlertLabel] = useState<string>("알림");

  const urlMode = searchParams.get("mode");
  const effectiveMode: "company" | "personal" =
    urlMode === "MY" ? "personal" : urlMode === "TEAM" ? "company" : mode ?? (currentWorkspace === "MY" ? "personal" : "company");

  useEffect(() => {
    if (!session?.user || pathname === "/login" || pathname === "/choose-mode") return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const schedule = (fn: () => void) => {
      if (cancelled) return;
      timeoutId = setTimeout(fn, 0);
    };
    fetch("/api/mode")
      .then((r: any) => r.json())
      .then((d: any) => schedule(() => setMode(d?.mode ?? null)))
      .catch(() => schedule(() => setMode(null)));
    return () => {
      cancelled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [session?.user, pathname, urlMode]);

  useEffect(() => {
    if (!session?.user || pathname === "/login" || pathname === "/choose-mode") return;
    const load = () => {
      fetch("/api/settings/logo")
        .then((r: any) => (r.ok ? r.json() : { logoUrl: null }))
        .then((d: any) => setLogoUrl(d?.logoUrl ?? null))
        .catch(() => setLogoUrl(null));
    };
    load();
    window.addEventListener("logo-updated", load);
    return () => window.removeEventListener("logo-updated", load);
  }, [session?.user, pathname]);

  // 직원만 채팅 미읽음 배지 표시
  useEffect(() => {
    if (!session?.user?.id || pathname === "/choose-mode" || effectiveMode !== "company" || session.user.role !== "USER") {
      setChatUnreadCount(0);
      return;
    }
    const run = () => {
      fetch("/api/chats")
        .then((r: any) => (r.ok ? r.json() : []))
        .then((list: any) => {
          let count = 0;
          for (const c of list) {
            if (!c.lastMessage || c.lastMessage.user.id === session.user?.id) continue;
            const readAt = typeof localStorage !== "undefined" ? localStorage.getItem(CHAT_READ_KEY + c.id) : null;
            if (!readAt || new Date(c.lastMessage.createdAt) > new Date(readAt)) count += 1;
          }
          setChatUnreadCount(count);
        })
        .catch(() => setChatUnreadCount(0));
    };
    run();
    const t = setInterval(run, 5000);
    return () => clearInterval(t);
  }, [session?.user?.id, session?.user?.role, effectiveMode, pathname]);

  useEffect(() => {
    if (session?.user?.role !== "USER" || pathname === "/choose-mode") return;
    const onRead = () => {
      if (session?.user?.id && effectiveMode === "company") {
        fetch("/api/chats")
          .then((r: any) => (r.ok ? r.json() : []))
          .then((list: any) => {
            let count = 0;
            for (const c of list) {
              if (!c.lastMessage || c.lastMessage.user.id === session.user?.id) continue;
              const readAt = typeof localStorage !== "undefined" ? localStorage.getItem(CHAT_READ_KEY + c.id) : null;
              if (!readAt || new Date(c.lastMessage.createdAt) > new Date(readAt)) count += 1;
            }
            setChatUnreadCount(count);
          })
          .catch(() => {});
      }
    };
    window.addEventListener("chat-read", onRead);
    return () => window.removeEventListener("chat-read", onRead);
  }, [session?.user?.id, session?.user?.role, effectiveMode, pathname]);

  // 팀장·이체 담당자·요청자: 자금관리 뱃지 (승인대기/이체대기/이체완료 알람)
  useEffect(() => {
    if (pathname === "/choose-mode" || effectiveMode !== "company") {
      setPaymentAlertCount(0);
      setPaymentAlertLabel("알림");
      return;
    }
    const run = () => {
      fetch("/api/finance/alerts/count", { cache: "no-store", headers: { "Cache-Control": "no-cache" } })
        .then((r: any) => (r.ok ? r.json() : { count: 0, label: "알림" }))
        .then((d: any) => {
          setPaymentAlertCount(d?.count ?? 0);
          setPaymentAlertLabel(d?.label ?? "알림");
        })
        .catch(() => {
          setPaymentAlertCount(0);
          setPaymentAlertLabel("알림");
        });
    };
    run();
    const t = setInterval(run, 5000);
    const onVisibility = () => { if (typeof document !== "undefined" && document.visibilityState === "visible") run(); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(t);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [effectiveMode, pathname]);

  if (pathname === "/login" || pathname === "/choose-mode") return null;

  const isCompany = effectiveMode === "company";
  const isExecutive = session?.user?.role === "EXECUTIVE" || session?.user?.role === "ADMIN";
  const isTeamLead = session?.user?.role === "TEAM_LEAD";

  const userForPermission = session?.user as { role?: string; permissions?: string | null } | undefined;
  const can = (featureKey: string) => {
    try {
      return userForPermission ? userHasPermission(userForPermission as any, featureKey) : true;
    } catch {
      return true;
    }
  };

  const mainLinks = mainGroupLinks.filter(
    (l: any) => (!l.featureKey || can(l.featureKey)) && (!l.companyOnly || isCompany)
  );
  const workLinks = workGroupLinks.filter((l: any) => !l.featureKey || can(l.featureKey));
  const hrLinks = hrGroupLinks.filter(
    (l: any) => (!l.featureKey || can(l.featureKey)) && (!l.companyOnly || isCompany)
  );
  const financeLinks = financeGroupLinks.filter((l: any) => !l.featureKey || can(l.featureKey));

  const adminLinks = isExecutive
    ? [
        { href: "/admin", label: "관리 홈", icon: Settings },
        { href: "/admin/employees", label: "직원 관리", icon: Users },
        { href: "/admin/logs", label: "업무일지 조회", icon: FileText },
        { href: "/admin/departments-positions", label: "부서·직책", icon: Layers },
        { href: "/admin/projects", label: "브랜드/프로젝트", icon: FolderKanban },
        { href: "/admin/deleted-projects", label: "삭제된 프로젝트", icon: FolderKanban },
        { href: "/admin/company", label: "회사 정보", icon: Building2 },
        { href: "/admin/settings/logo", label: "로고 설정", icon: Image },
      ]
    : [];

  const roleLabel =
    session?.user?.role === "TEAM_LEAD"
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
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-bold text-gray-900 transition-colors hover:text-violet-600"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="COMPLETE CRM" className="h-8 w-auto max-w-[140px] object-contain" />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
                <Command className="size-4" />
              </div>
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
          <Button variant="ghost" asChild className={cn("flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200", pathname === "/dashboard" || pathname.startsWith("/dashboard/") ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")}>
            <Link href="/dashboard" className="flex items-center gap-1.5">
              <LayoutDashboard className="size-4" />
              <span>대시보드</span>
            </Link>
          </Button>

          {/* 업무 단일 버튼 */}
          {can("tasks") && (
            <Button variant="ghost" asChild className={cn("flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200", pathname === "/tasks" || pathname.startsWith("/tasks/") ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")}>
              <Link href="/tasks" className="flex items-center gap-1.5">
                <ListTodo className="size-4" />
                <span>업무</span>
              </Link>
            </Button>
          )}

          {/* 게시판(자료실) - 회사 모드에서만 */}
          {isCompany && can("board") && (
            <Button variant="ghost" asChild className={cn("flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200", pathname === "/board" || pathname.startsWith("/board/") ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")}>
              <Link href="/board" className="flex items-center gap-1.5">
                <FolderOpen className="size-4" />
                <span>게시판</span>
              </Link>
            </Button>
          )}

          {/* 채팅 - 회사 모드에서만 */}
          {isCompany && can("chat") && (
            <Button variant="ghost" asChild className={cn("flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all duration-200", pathname === "/chat" || pathname.startsWith("/chat/") ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900")}>
              <Link href="/chat" className="relative flex items-center gap-1.5">
                <MessageCircle className="size-4" />
                <span>채팅</span>
                {chatUnreadCount > 0 && (
                  <span className="flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                  </span>
                )}
              </Link>
            </Button>
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
          <WorkspaceSwitcher />
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
                  <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
                    <User className="size-4" />
                    내 정보
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/my-project" className="flex items-center gap-2 cursor-pointer">
                    <FolderKanban className="size-4" />
                    내 프로젝트
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    if (process.env.NODE_ENV === "development") {
                      window.location.href = "/api/auth/dev-logout";
                      return;
                    }
                    signOut({ callbackUrl: "/login" });
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

      {/* Mobile Navigation (shown below header on small screens) */}
      <div className="flex overflow-x-auto border-t border-gray-100 bg-white px-4 py-2 md:hidden">
        <div className="flex gap-1">
          {[...mainLinks, ...workLinks, ...hrLinks, ...financeLinks].map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            const isHr = hrLinks.some((l: any) => l.href === href);
            const isFinance = financeLinks.some((l: any) => l.href === href);
            return (
              <Link
                key={href}
                href={href}
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
                {href === "/chat" && chatUnreadCount > 0 && (
                  <span className="ml-1 flex min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[9px] font-bold text-white">
                    {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
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
              href="/admin/employees"
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
