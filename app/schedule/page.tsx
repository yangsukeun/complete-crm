"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { jsonFetcher, SWR_KEYS } from "@/lib/api-swr";
import { EVENT_PALETTE, type CalendarLayerId } from "@/lib/schedule-colors";

export type { CalendarLayerId };
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Calendar, dateFnsLocalizer, type View, Navigate } from "react-big-calendar";
import {
  format,
  parse,
  startOfWeek,
  getDay,
  startOfDay,
  endOfDay,
  isSameDay,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  addDays,
  isBefore,
  isAfter,
} from "date-fns";
import { ko } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { ScheduleDetailModal } from "@/components/schedule-detail-modal";
import { CreateScheduleModal } from "@/components/create-schedule-modal";
import { CreateTaskModal } from "@/components/create-task-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  CalendarClock,
  ListTodo,
  FileText,
  CalendarDays,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn, formatUserName } from "@/lib/utils";
import { PageHeadline } from "@/components/page-headline";
import {
  getKoreanHolidays,
  isLegalHoliday,
  type HolidayItem,
} from "@/lib/korean-holidays";
import "./schedule-calendar.css";

const locales = { "ko-KR": ko };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

type ScheduleEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  calendarId?: CalendarLayerId;
  resource?: { id: string; title: string; description: string | null; startTime: string; endTime: string; isAllDay: boolean; userId: string; userName?: string };
  /** 업무 마감일 이벤트 전용 (react-big-calendar 커스텀) */
  isTaskDue?: boolean;
  taskDueOverdue?: boolean;
  taskDueCompleted?: boolean;
  /** 마감일 원본(yyyy-MM-dd) — D-day 뱃지 */
  taskDueDate?: string;
};

function toEvent(
  s: {
    id: string;
    title: string;
    description: string | null;
    startTime: string;
    endTime: string;
    isAllDay: boolean;
    userId: string;
    user?: { name: string; position?: string | null } | null;
  },
  calendarId: CalendarLayerId
): ScheduleEvent {
  return {
    id: s.id,
    title: s.title,
    start: new Date(s.startTime),
    end: new Date(s.endTime),
    allDay: s.isAllDay,
    calendarId,
    resource: {
      id: s.id,
      title: s.title,
      description: s.description,
      startTime: s.startTime,
      endTime: s.endTime,
      isAllDay: s.isAllDay,
      userId: s.userId,
      userName: s.user ? formatUserName(s.user) : undefined,
    },
  };
}

function holidayToEvent(h: HolidayItem): ScheduleEvent {
  const d = new Date(h.date + "T00:00:00");
  return {
    id: `hol-${h.date}-${h.name}`,
    title: h.name,
    start: d,
    end: d,
    allDay: true,
    calendarId: "holiday",
  };
}

const CALENDAR_LAYERS_STORAGE_KEY = "schedule-visible-calendars";

const DEFAULT_VISIBLE_CALENDARS: Record<CalendarLayerId, boolean> = {
  personal: true,
  team: true,
  holiday: true,
  google: true,
  taskDue: true,
};

function tasksToCalendarDueEvents(
  tasks: { id: string; title: string; dueDate: string; isCompleted: boolean }[],
  now: Date
): ScheduleEvent[] {
  const sod = startOfDay(now);
  return tasks.map((t) => {
    const d = startOfDay(new Date(t.dueDate));
    const end = endOfDay(new Date(t.dueDate));
    const overdue = !t.isCompleted && d < sod;
    return {
      id: `task-due-${t.id}`,
      title: `[프로젝트] ${t.title}`,
      start: d,
      end,
      allDay: true,
      calendarId: "taskDue",
      isTaskDue: true,
      taskDueOverdue: overdue,
      taskDueCompleted: t.isCompleted,
      taskDueDate: t.dueDate,
    };
  });
}

function loadVisibleCalendars(): Record<CalendarLayerId, boolean> {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_CALENDARS;
  try {
    const raw = localStorage.getItem(CALENDAR_LAYERS_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_CALENDARS;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return { ...DEFAULT_VISIBLE_CALENDARS, ...parsed };
  } catch {
    return DEFAULT_VISIBLE_CALENDARS;
  }
}

function CustomDateHeader({
  label,
  date,
  drilldownView,
  onDrillDown,
}: {
  label: string;
  date: Date;
  drilldownView?: string;
  onDrillDown?: (e: React.MouseEvent) => void;
}) {
  const dow = getDay(date);
  const isSat = dow === 6;
  const isSun = dow === 0;
  const legal = isLegalHoliday(date);
  const className = legal ? "rbc-date-cell--legal-holiday" : isSun ? "rbc-date-cell--sunday" : isSat ? "rbc-date-cell--saturday" : "";
  const content = <span className={className}>{label}</span>;
  if (drilldownView && onDrillDown) {
    return (
      <button type="button" className="rbc-button-link" onClick={onDrillDown}>
        {content}
      </button>
    );
  }
  return content;
}

/** 승인 휴가를 캘린더에 표시할 때 종류(휴가·반차 등) */
const CALENDAR_LEAVE_LABELS: Record<string, string> = {
  ANNUAL: "휴가",
  HALF_AM: "오전 반차",
  HALF_PM: "오후 반차",
  QUARTER_AM: "오전 반반차",
  QUARTER_PM: "오후 반반차",
  SICK_PAID: "유급 병가",
  SICK_UNPAID: "무급 병가",
};

function calendarLeaveTypeLabel(type: string): string {
  return CALENDAR_LEAVE_LABELS[type] ?? "휴가";
}

function createDateCellWrapper(leaveByDate: Record<string, string[]>) {
  return function DateCellWrapper({ value, children }: { value: Date; children: React.ReactNode }) {
    const key = format(value, "yyyy-MM-dd");
    const lines = leaveByDate[key] ?? [];
    return (
      <div className="rbc-date-cell-wrapper-inner">
        {children}
        {lines.length > 0 && (
          <div className="rbc-date-cell-leave-names" aria-label={`근태: ${lines.join(", ")}`}>
            {lines.map((line) => (
              <span key={line} className="rbc-date-cell-leave-name">
                {line}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };
}

function getDday(dueDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return { label: "D-Day", color: "#d93025" };
  if (diff > 0) return { label: `D-${diff}`, color: "#1a73e8" };
  return { label: `D+${Math.abs(diff)}`, color: "#9e9e9e" };
}

function paletteForEvent(event: ScheduleEvent): { bg: string; light: string; text: string } {
  if (event.isTaskDue || (typeof event.id === "string" && event.id.startsWith("task-due"))) {
    if (event.taskDueOverdue && !event.taskDueCompleted) {
      return { bg: "#b71c1c", light: "#ffebee", text: "#ffffff" };
    }
    return EVENT_PALETTE.taskDue;
  }
  if (event.calendarId === "holiday" || (typeof event.id === "string" && event.id.startsWith("hol-"))) {
    return EVENT_PALETTE.holiday;
  }
  if (event.calendarId === "google") return EVENT_PALETTE.google;
  if (event.calendarId === "personal") return EVENT_PALETTE.personal;
  if (event.calendarId === "team") return EVENT_PALETTE.team;
  return EVENT_PALETTE.personal;
}

function ScheduleCalendarEvent({
  event,
  title,
  isAllDay: allDayAccessor,
}: {
  event: ScheduleEvent;
  title: string;
  isAllDay?: boolean;
  continuesPrior?: boolean;
  continuesAfter?: boolean;
  localizer?: unknown;
  slotStart?: Date;
  slotEnd?: Date;
}) {
  const pal = paletteForEvent(event);
  const isAllDay = Boolean(allDayAccessor || event.allDay);
  const startTime = format(event.start, "HH:mm", { locale: ko });
  const dday =
    event.taskDueDate != null && (event.isTaskDue || String(event.id).startsWith("task-due"))
      ? getDday(event.taskDueDate)
      : null;

  return (
    <div
      className={cn(
        "schedule-gcal-event-chip",
        isAllDay ? "schedule-gcal-event-chip--allday" : "schedule-gcal-event-chip--timed"
      )}
      style={{
        background: isAllDay ? pal.bg : pal.light,
        color: isAllDay ? pal.text : pal.bg,
        borderLeftColor: !isAllDay ? pal.bg : undefined,
      }}
    >
      <div className="schedule-gcal-event-chip__row">
        <span className="schedule-gcal-event-chip__title">
          {!isAllDay && <span className="mr-1 text-[11px] opacity-80">{startTime}</span>}
          {title}
        </span>
        {dday && (
          <span className="schedule-gcal-dday" style={{ background: dday.color }}>
            {dday.label}
          </span>
        )}
      </div>
    </div>
  );
}

type ScheduleInvite = {
  id: string;
  scheduleId: string;
  schedule: { title: string; startTime: string; endTime: string };
  fromUser: { id: string; name: string; position?: string | null };
  status: string;
};

type TaskItem = {
  id: string;
  title: string;
  dueDate: string;
  isCompleted: boolean;
  priority: string;
  assignees?: { id: string; name: string; position?: string | null }[];
  assignedTo: { name: string; position?: string | null } | null;
};

type NoDueBrandProject = {
  id: string;
  name: string;
  brand: { id: string; name: string };
};

type LeaveRequestItem = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  user: { name: string; position?: string | null };
};

type TabId = "schedule" | "tasks" | "diary";

const PAGE_TAB_ITEMS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "schedule", label: "일정", icon: <CalendarDays className="size-4" /> },
  { id: "tasks", label: "할일", icon: <ListTodo className="size-4" /> },
  { id: "diary", label: "Daily Report", icon: <FileText className="size-4" /> },
];

const CALENDAR_LAYER_LABELS: Record<CalendarLayerId, string> = {
  personal: "내 일정",
  team: "팀/회사 일정",
  holiday: "공휴일",
  google: "Google 캘린더",
  taskDue: "프로젝트 마감",
};

const CALENDAR_CHIP_COLORS: Record<CalendarLayerId, string> = {
  personal: EVENT_PALETTE.personal.bg,
  team: EVENT_PALETTE.team.bg,
  holiday: EVENT_PALETTE.holiday.bg,
  google: EVENT_PALETTE.google.bg,
  taskDue: EVENT_PALETTE.taskDue.bg,
};

type ScheduleHeaderGoogleProps = {
  showCalendarNav: boolean;
  tab: TabId;
  setTab: (t: TabId) => void;
  pageTabs: { id: TabId; label: string; icon: React.ReactNode }[];
  date: Date;
  view: View;
  calendarTitle: string;
  onCalendarNavigate: (action: string, newDate?: Date) => void;
  onViewChange: (v: View) => void;
  headerMessages: { today: string; prev: string; next: string; month: string; week: string };
  googleConnected: boolean;
  onGoogleDisconnect: () => void | Promise<void>;
  onGoogleConnect: () => void;
  onNewSchedule: () => void;
};

function ScheduleHeaderGoogle({
  showCalendarNav,
  tab,
  setTab,
  pageTabs,
  date,
  view,
  calendarTitle,
  onCalendarNavigate,
  onViewChange,
  headerMessages,
  googleConnected,
  onGoogleDisconnect,
  onGoogleConnect,
  onNewSchedule,
}: ScheduleHeaderGoogleProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const currentYear = date.getFullYear();
  const currentMonth = date.getMonth();
  const yearRange = 5;
  const startYear = currentYear - Math.floor(yearRange / 2);
  const endYear = currentYear + Math.floor(yearRange / 2);

  const monthOptions = useMemo(() => {
    const list: { year: number; month: number; label: string }[] = [];
    for (let y = startYear; y <= endYear; y++) {
      for (let m = 0; m < 12; m++) {
        list.push({
          year: y,
          month: m,
          label: format(new Date(y, m, 1), "yyyy년 M월", { locale: ko }),
        });
      }
    }
    return list;
  }, [startYear, endYear]);

  const currentIndex = (currentYear - startYear) * 12 + currentMonth;

  useEffect(() => {
    if (pickerOpen && listRef.current) {
      const el = listRef.current.querySelector(`[data-index="${currentIndex}"]`);
      el?.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [pickerOpen, currentIndex]);

  const handleSelectMonth = useCallback(
    (year: number, month: number) => {
      onCalendarNavigate(Navigate.DATE, new Date(year, month, 1));
      setPickerOpen(false);
    },
    [onCalendarNavigate]
  );

  return (
    <header className="sticky top-0 z-20 border-b border-[#e5e7eb] bg-white dark:border-border dark:bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:gap-3">
          {showCalendarNav ? (
            <>
              <button
                type="button"
                className="shrink-0 rounded-full border border-[#e0e0e0] bg-white px-4 py-2 text-sm font-medium text-[#3c4043] transition-colors hover:bg-[#f8f9fa] dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted/60"
                onClick={() => onCalendarNavigate(Navigate.TODAY)}
              >
                {headerMessages.today}
              </button>
              <div className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-full text-[#3c4043] transition-colors hover:bg-[#f1f3f4] dark:text-foreground dark:hover:bg-muted"
                  aria-label={headerMessages.prev}
                  onClick={() => onCalendarNavigate(Navigate.PREVIOUS)}
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-full text-[#3c4043] transition-colors hover:bg-[#f1f3f4] dark:text-foreground dark:hover:bg-muted"
                  aria-label={headerMessages.next}
                  onClick={() => onCalendarNavigate(Navigate.NEXT)}
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>
              <div className="relative min-w-0">
                <button
                  type="button"
                  className="schedule-gcal-month-title text-left text-base font-normal leading-tight text-[#3c4043] hover:underline dark:text-foreground md:text-[22px] md:font-normal"
                  onClick={() => setPickerOpen((o) => !o)}
                  aria-expanded={pickerOpen}
                  aria-haspopup="listbox"
                >
                  {calendarTitle}
                </button>
                {pickerOpen && (
                  <>
                    <div className="fixed inset-0 z-40" aria-hidden onClick={() => setPickerOpen(false)} />
                    <div
                      ref={listRef}
                      role="listbox"
                      className="absolute left-0 top-full z-50 mt-1 max-h-[280px] w-56 overflow-y-auto rounded-lg border border-[#e0e0e0] bg-card py-1 shadow-lg dark:border-border"
                    >
                      {monthOptions.map((opt, idx) => (
                        <button
                          key={`${opt.year}-${opt.month}`}
                          type="button"
                          data-index={idx}
                          role="option"
                          aria-selected={opt.year === currentYear && opt.month === currentMonth}
                          className={cn(
                            "w-full px-3 py-2 text-left text-sm hover:bg-muted",
                            opt.year === currentYear && opt.month === currentMonth && "bg-muted font-medium"
                          )}
                          onClick={() => handleSelectMonth(opt.year, opt.month)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="mx-0.5 hidden h-6 w-px shrink-0 bg-[#e0e0e0] dark:bg-border sm:block" />
              <div className="flex shrink-0 overflow-hidden rounded-lg border border-[#e0e0e0] dark:border-border">
                <button
                  type="button"
                  className={cn(
                    "schedule-gcal-view-tab-btn px-3 py-2 text-sm font-medium transition-colors",
                    view === "month"
                      ? "bg-[#1a73e8] text-white"
                      : "bg-white text-[#3c4043] hover:bg-[#f8f9fa] dark:bg-card dark:text-foreground dark:hover:bg-muted/60"
                  )}
                  onClick={() => onViewChange("month")}
                >
                  {headerMessages.month}
                </button>
                <button
                  type="button"
                  className={cn(
                    "schedule-gcal-view-tab-btn border-l border-[#e0e0e0] px-3 py-2 text-sm font-medium transition-colors dark:border-border",
                    view === "week"
                      ? "bg-[#1a73e8] text-white"
                      : "bg-white text-[#3c4043] hover:bg-[#f8f9fa] dark:bg-card dark:text-foreground dark:hover:bg-muted/60"
                  )}
                  onClick={() => onViewChange("week")}
                >
                  {headerMessages.week}
                </button>
              </div>
            </>
          ) : (
            <h2 className="schedule-gcal-month-title truncate text-lg font-normal text-[#3c4043] dark:text-foreground md:text-[22px]">
              {pageTabs.find((x) => x.id === tab)?.label ?? "스케줄"}
            </h2>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {showCalendarNav && (
            <>
              {googleConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 border-[#e0e0e0] text-[#3c4043] dark:border-border"
                  onClick={() => void onGoogleDisconnect()}
                >
                  <CalendarIcon className="mr-1.5 size-4" />
                  <span className="hidden sm:inline">Google · 해제</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 border-[#e0e0e0] text-[#3c4043] dark:border-border"
                  onClick={onGoogleConnect}
                >
                  <CalendarIcon className="mr-1.5 size-4" />
                  <span className="hidden sm:inline">Google 연동</span>
                </Button>
              )}
              <Button
                size="sm"
                className="h-9 shrink-0 bg-[#1a73e8] hover:bg-[#1557b0]"
                onClick={onNewSchedule}
              >
                <Plus className="mr-1.5 size-4" />
                <span className="hidden sm:inline">새 일정</span>
              </Button>
            </>
          )}
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-[#e0e0e0] dark:border-border">
            {pageTabs.map((t, i) => (
              <button
                key={t.id}
                type="button"
                className={cn(
                  "schedule-gcal-view-tab-btn flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium transition-colors sm:px-4",
                  i < pageTabs.length - 1 && "border-r border-[#e0e0e0] dark:border-border",
                  tab === t.id
                    ? "bg-[#1a73e8] text-white"
                    : "bg-white text-[#3c4043] hover:bg-[#f8f9fa] dark:bg-card dark:text-foreground dark:hover:bg-muted/50"
                )}
                onClick={() => setTab(t.id)}
              >
                {t.icon}
                <span className="schedule-gcal-view-tab-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

type LeaveApiResponse = { requests?: LeaveRequestItem[] };

export default function SchedulePage() {
  const [tab, setTab] = useState<TabId>("schedule");
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(new Date());
  const [diaryDate, setDiaryDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [memoContent, setMemoContent] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSlot, setCreateSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [defaultInviteUserIdsForCreate, setDefaultInviteUserIdsForCreate] = useState<string[] | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [googleEvents, setGoogleEvents] = useState<ScheduleEvent[]>([]);
  /** 서버·클라이언트 초기값 동일(localStorage는 마운트 후에만 읽기) → 하이드레이션 불일치 방지 */
  const [visibleCalendars, setVisibleCalendars] = useState<Record<CalendarLayerId, boolean>>(
    DEFAULT_VISIBLE_CALENDARS
  );
  useEffect(() => {
    setVisibleCalendars(loadVisibleCalendars());
  }, []);
  const { data: session } = useSession();
  const router = useRouter();

  type SchedBundle = { personal?: unknown[]; team?: unknown[] };
  const {
    data: schedBundle,
    mutate: mutateSchedBundle,
    isLoading: bundleLoading,
  } = useSWR<SchedBundle>(session?.user ? SWR_KEYS.schedulesBundle : null, jsonFetcher, {
    dedupingInterval: 12_000,
    revalidateOnFocus: false,
  });
  const personalRaw = (schedBundle?.personal ?? []) as Parameters<typeof toEvent>[0][];
  const teamRaw = (schedBundle?.team ?? []) as Parameters<typeof toEvent>[0][];

  const personalEvents = useMemo(
    () => (personalRaw as Parameters<typeof toEvent>[0][]).map((s) => toEvent(s, "personal")),
    [personalRaw]
  );
  const teamEvents = useMemo(
    () => (teamRaw as Parameters<typeof toEvent>[0][]).map((s) => toEvent(s, "team")),
    [teamRaw]
  );

  // [PERF-2차] 월/주 단위 키로 SWR 캐시 안정화·중복 요청 감소
  const calendarDueKey =
    session?.user && tab === "schedule"
      ? view === "month"
        ? `/api/tasks?calendarDue=1&monthKey=${format(date, "yyyy-MM")}`
        : `/api/tasks?calendarDue=1&weekKey=${format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd")}`
      : null;
  const { data: calendarDueRaw = [], mutate: mutateCalendarDueTasks } = useSWR(
    calendarDueKey,
    jsonFetcher,
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );

  const noDueProjectsKey =
    session?.user && tab === "schedule" ? "/api/projects?noDueDate=1" : null;
  const { data: noDeadlineProjects = [] } = useSWR<NoDueBrandProject[]>(
    noDueProjectsKey,
    jsonFetcher,
    { dedupingInterval: 120_000, revalidateOnFocus: true }
  );
  const taskDueEvents = useMemo(
    () =>
      tasksToCalendarDueEvents(
        (calendarDueRaw as { id: string; title: string; dueDate: string; isCompleted: boolean }[]) ?? [],
        new Date()
      ),
    [calendarDueRaw]
  );

  const schedulesLoading = Boolean(session?.user) && bundleLoading;

  // [PERF-auto] tasks?all=1 — 할일 탭에서만 활성 (isPaused로 탭·하이드레이션 타이밍 이중 방어)
  const tasksAllKey = session?.user ? SWR_KEYS.tasksAll : null;
  const diaryTasksKey =
    session?.user && tab === "diary"
      ? `/api/tasks?dueDay=${encodeURIComponent(diaryDate)}`
      : null;
  const { data: tasksRaw, mutate: mutateTasks } = useSWR(tasksAllKey, jsonFetcher, {
    dedupingInterval: 300_000,
    revalidateOnFocus: false,
    revalidateIfStale: false, // [PERF-claude-code] 캐시 존재 시 리마운트로 재검증 안 함
    isPaused: () => tab !== "tasks",
  });
  const { data: diaryTasksRaw, mutate: mutateDiaryTasks } = useSWR(
    diaryTasksKey,
    jsonFetcher,
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );
  const tasks = useMemo((): TaskItem[] => {
    const rawSource = tab === "diary" ? diaryTasksRaw : tab === "tasks" ? tasksRaw : null;
    if (rawSource == null) return [];
    const raw = rawSource as unknown[] | { items?: unknown[] };
    const list = (Array.isArray(raw) ? raw : raw.items ?? []) as {
      id: string;
      title: string;
      dueDate: string;
      isCompleted: boolean;
      priority: string;
      assignees?: TaskItem["assignees"];
      assignedTo: TaskItem["assignedTo"];
    }[];
    return list.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      isCompleted: t.isCompleted,
      priority: t.priority,
      assignees: t.assignees,
      assignedTo: t.assignedTo,
    }));
  }, [tab, tasksRaw, diaryTasksRaw]);

  const { data: invites = [], mutate: mutateInvites } = useSWR<ScheduleInvite[]>(
    session?.user ? SWR_KEYS.scheduleInvites : null,
    jsonFetcher,
    { dedupingInterval: 20_000, revalidateOnFocus: false }
  );

  const { data: leaveData, mutate: mutateLeave } = useSWR<LeaveApiResponse>(
    session?.user ? SWR_KEYS.leave : null,
    jsonFetcher,
    { dedupingInterval: 25_000, revalidateOnFocus: false }
  );
  const leaveRequests = leaveData?.requests ?? [];

  const memoSwrKey =
    tab === "diary" && session?.user ? `/api/memo?date=${encodeURIComponent(diaryDate)}` : null;
  const { data: memoData, mutate: mutateMemo } = useSWR<{ content?: string }>(memoSwrKey, jsonFetcher, {
    dedupingInterval: 30_000,
  });

  useEffect(() => {
    if (tab !== "diary") return;
    setMemoContent(memoData?.content ?? "");
  }, [tab, memoData]);

  const { data: gcalStatus, mutate: mutateGcal } = useSWR<{ connected: boolean }>(
    session?.user && tab === "schedule" ? SWR_KEYS.googleCalendar : null,
    jsonFetcher,
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );
  const googleConnected = gcalStatus?.connected ?? false;

  const revalidateSchedules = useCallback(() => {
    void mutateSchedBundle();
  }, [mutateSchedBundle]);

  useEffect(() => {
    const onWorkspaceChange = () => revalidateSchedules();
    window.addEventListener("workspace-changed", onWorkspaceChange);
    return () => window.removeEventListener("workspace-changed", onWorkspaceChange);
  }, [revalidateSchedules]);

  useEffect(() => {
    // [PERF-2차] Google 캘린더 레이어가 꺼져 있으면 이벤트 API 호출 생략
    if (!googleConnected || tab !== "schedule" || visibleCalendars.google === false) {
      setGoogleEvents([]);
      return;
    }
    const rangeStart = view === "month" ? startOfMonth(date) : startOfWeek(date, { weekStartsOn: 1 });
    const rangeEnd = view === "month" ? endOfMonth(date) : endOfWeek(date, { weekStartsOn: 1 });
    const timeMin = rangeStart.toISOString();
    const timeMax = rangeEnd.toISOString();
    fetch(`/api/integrations/google-calendar/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`)
      .then((r: any) => (r.ok ? r.json() : []))
      .then((list: { id: string; title: string; start: string; end: string; isAllDay: boolean }[]) => {
        setGoogleEvents(
          list.map((e: any) => ({
            id: e.id,
            title: `📅 ${e.title}`,
            start: new Date(e.start),
            end: new Date(e.end),
            allDay: e.isAllDay,
            calendarId: "google" as const,
          }))
        );
      })
      .catch(() => setGoogleEvents([]));
  }, [googleConnected, tab, view, date, visibleCalendars.google]);

  const handleSelectEvent = useCallback(
    (event: ScheduleEvent) => {
      if (typeof event.id === "string" && event.id.startsWith("task-due-")) {
        router.push(`/tasks/${event.id.slice("task-due-".length)}`);
        return;
      }
      if (typeof event.id === "string" && (event.id.startsWith("hol-") || event.id.startsWith("google-"))) return;
      setSelectedEvent(event);
      setModalOpen(true);
    },
    [router]
  );

  const searchParams = useSearchParams();
  useEffect(() => {
    const connected = searchParams.get("google_calendar") === "connected";
    const err = searchParams.get("error");
    if (connected) {
      toast.success("Google 캘린더가 연동되었습니다.");
      void mutateGcal();
      router.replace("/schedule", { scroll: false });
    } else if (err === "google_calendar_not_configured") {
      toast.error("Google 캘린더 연동이 설정되지 않았습니다. .env에 GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET을 추가하세요.");
      router.replace("/schedule", { scroll: false });
    } else if (err === "google_calendar_denied") {
      toast.error("Google 캘린더 권한을 허용해 주세요.");
      router.replace("/schedule", { scroll: false });
    } else if (err === "google_calendar_token") {
      toast.error("Google 로그인 처리에 실패했습니다. redirect_uri가 Google Cloud 콘솔에 등록된 값과 같은지 확인하세요.");
      router.replace("/schedule", { scroll: false });
    } else if (err === "google_calendar_failed") {
      toast.error("Google 캘린더 연동에 실패했습니다.");
      router.replace("/schedule", { scroll: false });
    }
  }, [searchParams, router, mutateGcal]);

  useEffect(() => {
    const openCreate = searchParams.get("openCreate");
    const inviteUserId = searchParams.get("inviteUserId");
    if (openCreate === "1" && inviteUserId) {
      setDefaultInviteUserIdsForCreate([inviteUserId]);
      setCreateOpen(true);
      router.replace("/schedule", { scroll: false });
    }
  }, [searchParams, router]);

  const handleSelectSlot = useCallback((slotInfo: { start: Date; end: Date }) => {
    setCreateSlot({ start: slotInfo.start, end: slotInfo.end });
    setCreateOpen(true);
  }, []);

  const handleCreateOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setCreateSlot(null);
      setDefaultInviteUserIdsForCreate(null);
    }
    setCreateOpen(open);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setSelectedEvent(null);
  }, []);

  const handleSaved = useCallback(() => {
    revalidateSchedules();
    handleCloseModal();
  }, [revalidateSchedules, handleCloseModal]);

  const handleDeleted = useCallback(() => {
    revalidateSchedules();
    handleCloseModal();
  }, [revalidateSchedules, handleCloseModal]);

  const handleInviteResponse = useCallback(
    async (inviteId: string, status: "ACCEPTED" | "REJECTED") => {
      setProcessingId(inviteId);
      try {
        const res = await fetch(`/api/schedules/invites/${inviteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "처리 실패");
        }
        toast.success(status === "ACCEPTED" ? "일정이 내 일정표에 추가되었습니다." : "초대를 거절했습니다.");
        void mutateInvites();
        if (status === "ACCEPTED") revalidateSchedules();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리에 실패했습니다.");
      } finally {
        setProcessingId(null);
      }
    },
    [mutateInvites, revalidateSchedules]
  );

  const saveMemo = useCallback(async () => {
    setMemoSaving(true);
    try {
      const res = await fetch("/api/memo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: diaryDate, content: memoContent }),
      });
      if (!res.ok) throw new Error("저장 실패");
      toast.success("메모를 저장했습니다.");
      void mutateMemo();
    } catch {
      toast.error("메모 저장에 실패했습니다.");
    } finally {
      setMemoSaving(false);
    }
  }, [diaryDate, memoContent, mutateMemo]);

  const holidayEvents = useMemo(() => {
    const y = date.getFullYear();
    const prev = getKoreanHolidays(y - 1);
    const curr = getKoreanHolidays(y);
    const next = getKoreanHolidays(y + 1);
    return [...prev, ...curr, ...next].map(holidayToEvent);
  }, [date]);

  /** 날짜별 승인 휴가 (yyyy-MM-dd -> "이름 (휴가|반차 …)"[]) */
  const leaveByDate = useMemo(() => {
    const map: Record<string, string[]> = {};
    const approved = leaveRequests.filter((r: LeaveRequestItem) => r.status === "APPROVED");
    for (const r of approved) {
      const start = startOfDay(new Date(r.startDate));
      const end = endOfDay(new Date(r.endDate));
      const name = formatUserName(r.user);
      const kind = calendarLeaveTypeLabel(r.type);
      let d = start;
      while (d <= end) {
        const key = format(d, "yyyy-MM-dd");
        if (!map[key]) map[key] = [];
        const line = `${name} (${kind})`;
        if (!map[key].includes(line)) map[key].push(line);
        d = addDays(d, 1);
      }
    }
    return map;
  }, [leaveRequests]);

  const setVisibleCalendar = useCallback((layer: CalendarLayerId, visible: boolean) => {
    setVisibleCalendars((prev: any) => {
      const next = { ...prev, [layer]: visible };
      try {
        localStorage.setItem(CALENDAR_LAYERS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const displayEvents = useMemo(() => {
    const all = [...personalEvents, ...teamEvents, ...holidayEvents, ...googleEvents, ...taskDueEvents];
    return all.filter((e: any) => (e.calendarId ? (visibleCalendars as any)[e.calendarId] !== false : true));
  }, [personalEvents, teamEvents, holidayEvents, googleEvents, taskDueEvents, visibleCalendars]);

  const diaryDayStart = startOfDay(new Date(diaryDate));
  const diaryDayEnd = endOfDay(new Date(diaryDate));
  const eventsOnDay = displayEvents.filter(
    (e: any) => (e.start >= diaryDayStart && e.start <= diaryDayEnd) || (e.end >= diaryDayStart && e.end <= diaryDayEnd) || (e.start <= diaryDayStart && e.end >= diaryDayEnd)
  );
  const tasksOnDay =
    tab === "diary"
      ? tasks
      : tasks.filter((t: TaskItem) => isSameDay(new Date(t.dueDate), new Date(diaryDate)));

  const calendarTitle = useMemo(() => {
    if (view === "month") return format(date, "yyyy년 M월", { locale: ko });
    const ws = startOfWeek(date, { weekStartsOn: 1 });
    const we = endOfWeek(date, { weekStartsOn: 1 });
    return `${format(ws, "yyyy.M.d", { locale: ko })} – ${format(we, "yyyy.M.d", { locale: ko })}`;
  }, [date, view]);

  const handleCalendarNavigate = useCallback(
    (action: string, newDate?: Date) => {
      if (action === Navigate.TODAY) {
        setDate(new Date());
        return;
      }
      if (action === Navigate.DATE && newDate) {
        setDate(newDate);
        return;
      }
      if (view === "month") {
        if (action === Navigate.PREVIOUS) setDate(localizer.add(date, -1, "month"));
        else if (action === Navigate.NEXT) setDate(localizer.add(date, 1, "month"));
      } else {
        if (action === Navigate.PREVIOUS) setDate(localizer.add(date, -1, "week"));
        else if (action === Navigate.NEXT) setDate(localizer.add(date, 1, "week"));
      }
    },
    [date, view, localizer]
  );

  const headerMessages = useMemo(
    () => ({
      today: "오늘",
      prev: "이전 기간",
      next: "다음 기간",
      month: "월",
      week: "주",
    }),
    []
  );

  const handleGoogleDisconnect = useCallback(async () => {
    const res = await fetch("/api/integrations/google-calendar", { method: "DELETE" });
    if (res.ok) {
      setGoogleEvents([]);
      void mutateGcal({ connected: false }, { revalidate: false });
      toast.success("Google 캘린더 연동을 해제했습니다.");
    }
  }, [mutateGcal]);

  const handleGoogleConnect = useCallback(() => {
    window.location.href = "/api/integrations/google-calendar/auth";
  }, []);

  if (schedulesLoading && tab === "schedule") {
    return (
      <div className="schedule-gcal-root flex min-h-[60vh] flex-col">
        <ScheduleHeaderGoogle
          showCalendarNav={true}
          tab={tab}
          setTab={setTab}
          pageTabs={PAGE_TAB_ITEMS}
          date={date}
          view={view}
          calendarTitle={calendarTitle}
          onCalendarNavigate={handleCalendarNavigate}
          onViewChange={setView}
          headerMessages={headerMessages}
          googleConnected={googleConnected}
          onGoogleDisconnect={handleGoogleDisconnect}
          onGoogleConnect={handleGoogleConnect}
          onNewSchedule={() => setCreateOpen(true)}
        />
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-muted-foreground">일정을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="schedule-gcal-root flex flex-col">
      <ScheduleHeaderGoogle
        showCalendarNav={tab === "schedule"}
        tab={tab}
        setTab={setTab}
        pageTabs={PAGE_TAB_ITEMS}
        date={date}
        view={view}
        calendarTitle={calendarTitle}
        onCalendarNavigate={handleCalendarNavigate}
        onViewChange={setView}
        headerMessages={headerMessages}
        googleConnected={googleConnected}
        onGoogleDisconnect={handleGoogleDisconnect}
        onGoogleConnect={handleGoogleConnect}
        onNewSchedule={() => setCreateOpen(true)}
      />

      <div className="flex flex-col gap-4 px-4 pb-6 pt-3 md:px-5">
        <div className="space-y-1">
          <PageHeadline
            title="스케줄"
            description="일정과 할일을 구분해 보고, Daily Report로 자동 정리할 수 있습니다."
          />
          {session?.user?.role &&
            ["TEAM_LEAD", "EXECUTIVE", "ADMIN"].includes(session.user.role) && (
              <p className="text-muted-foreground max-w-xl text-sm">
                팀 휴가·연차 승인·처리는{" "}
                <Link href="/leave" prefetch={false} className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
                  연차/근태
                </Link>
                에서 합니다. 신청 알림은 헤더 알림(
                <Link href="/notifications" prefetch={false} className="underline underline-offset-4 hover:no-underline">
                  알림함
                </Link>
                )에도 쌓입니다.
              </p>
            )}
        </div>

      {tab === "schedule" && (
        <>
          <div className="schedule-gcal-filter-chips -mx-1 px-1">
            {(["personal", "team", "holiday", "google", "taskDue"] as CalendarLayerId[]).map((layer) => {
              const on = visibleCalendars[layer] !== false;
              const color = CALENDAR_CHIP_COLORS[layer];
              return (
                <button
                  key={layer}
                  type="button"
                  onClick={() => setVisibleCalendar(layer, !on)}
                  className="flex shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-[13px] font-medium transition-all duration-150 hover:opacity-95"
                  style={{
                    borderColor: color,
                    background: on ? color : "transparent",
                    color: on ? "#ffffff" : color,
                  }}
                >
                  {on ? <span className="text-xs leading-none">✓</span> : null}
                  {CALENDAR_LAYER_LABELS[layer]}
                </button>
              );
            })}
          </div>

          {invites.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="size-4" />
                  일정 공유 초대 ({invites.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {invites.map((inv: any) => (
                    <li
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
                    >
                      <div>
                        <p className="font-medium">{inv.schedule.title}</p>
                        <p className="text-muted-foreground text-sm">
                          {formatUserName(inv.fromUser)}님이 공유 요청 ·{" "}
                          {format(new Date(inv.schedule.startTime), "MM/dd HH:mm", { locale: ko })} ~{" "}
                          {format(new Date(inv.schedule.endTime), "MM/dd HH:mm", { locale: ko })}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          disabled={processingId === inv.id}
                          onClick={() => handleInviteResponse(inv.id, "ACCEPTED")}
                        >
                          수락
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={processingId === inv.id}
                          onClick={() => handleInviteResponse(inv.id, "REJECTED")}
                        >
                          거절
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="schedule-gcal-viewport min-h-[520px] h-[min(70vh,900px)] w-full">
            <Calendar
              localizer={localizer}
              events={displayEvents}
              startAccessor="start"
              endAccessor="end"
              titleAccessor="title"
              view={view}
              onView={setView}
              date={date}
              onNavigate={setDate}
              onSelectEvent={handleSelectEvent}
              onSelectSlot={handleSelectSlot}
              selectable
              views={["month", "week"]}
              culture="ko-KR"
              toolbar={false}
              components={{
                dateHeader: CustomDateHeader as any,
                dateCellWrapper: createDateCellWrapper(leaveByDate) as any,
                event: ScheduleCalendarEvent as any,
              } as any}
              dayPropGetter={(d: any) => {
                const legal = isLegalHoliday(d);
                const sat = getDay(d) === 6;
                const cls = legal ? "rbc-day--legal-holiday" : sat ? "rbc-day--saturday" : "";
                return cls ? { className: cls } : {};
              }}
              eventPropGetter={() => ({})}
              messages={{
                today: "오늘",
                previous: "이전",
                next: "다음",
                month: "월",
                week: "주",
                day: "일",
                agenda: " agendas",
                date: "날짜",
                time: "시간",
                event: "일정",
                noEventsInRange: "이 기간에 일정이 없습니다.",
              }}
            />
          </div>

          {noDeadlineProjects.length > 0 && (
            <div className="mt-4 rounded-lg border border-[#e5e7eb] bg-[#fafafa] px-4 py-3 dark:border-border dark:bg-muted/30">
              <h3 className="mb-2 text-sm font-medium text-[#3c4043] dark:text-foreground">
                마감일 없는 프로젝트
              </h3>
              <p className="text-muted-foreground mb-3 text-xs">
                브랜드 프로젝트 중 마감일이 비어 있는 항목입니다. 상세는 프로젝트 페이지에서 확인하세요.
              </p>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {noDeadlineProjects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/projects/${p.id}`}
                      prefetch={false}
                      className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-[#1a73e8] hover:underline dark:text-primary"
                    >
                      <span className="size-2 shrink-0 rounded-full bg-blue-400" aria-hidden />
                      <span className="min-w-0 truncate">
                        <span className="text-muted-foreground text-xs">{p.brand.name}</span>
                        {" · "}
                        {p.name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {tab === "tasks" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">할일 목록</CardTitle>
              <p className="text-muted-foreground text-sm font-normal">
                담당·지시한 프로젝트입니다. 본인 할일을 추가하거나 Projects 페이지에서 상세·완료 처리할 수 있습니다.
              </p>
            </div>
            <Button size="sm" onClick={() => setCreateTaskOpen(true)}>
              <Plus className="mr-1.5 size-4" />
              내 할일 추가
            </Button>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">할일이 없습니다. 위 &#39;내 할일 추가&#39;로 등록하세요.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((t: TaskItem) => (
                  <li key={t.id} className="flex items-center gap-2 rounded border px-3 py-2">
                    <input
                      type="checkbox"
                      checked={t.isCompleted}
                      readOnly
                      className="size-4 rounded"
                    />
                    <span className={t.isCompleted ? "text-muted-foreground line-through" : ""}>
                      {t.title}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(t.dueDate), "MM/dd", { locale: ko })} ·{" "}
                      {t.assignees && t.assignees.length > 0
                        ? t.assignees.map((a) => formatUserName(a)).join(", ")
                        : t.assignedTo
                          ? formatUserName(t.assignedTo)
                          : "—"}
                    </span>
                    <Link href={`/tasks/${t.id}`} className="ml-auto text-primary text-sm hover:underline">
                      보기
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/tasks" prefetch={false} className="text-primary mt-3 inline-block text-sm font-medium hover:underline">
              Projects에서 전체 관리 →
            </Link>
          </CardContent>
        </Card>
      )}

      {tab === "diary" && (
        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          <div className="space-y-2">
            <label className="text-sm font-medium">날짜 선택</label>
            <input
              type="date"
              value={diaryDate}
              onChange={(e: any) => setDiaryDate(e.target.value)}
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">해당 날짜의 일정</CardTitle>
              </CardHeader>
              <CardContent>
                {eventsOnDay.length === 0 ? (
                  <p className="text-muted-foreground text-sm">해당 날짜에 일정이 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {eventsOnDay.map((e: any) => (
                      <li key={e.id} className="rounded border px-3 py-2 text-sm">
                        <span className="font-medium">{e.title}</span>
                        <span className="text-muted-foreground ml-2">
                          {e.allDay
                            ? "종일"
                            : `${format(e.start, "HH:mm", { locale: ko })} ~ ${format(e.end, "HH:mm", { locale: ko })}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">해당 날짜의 할일</CardTitle>
              </CardHeader>
              <CardContent>
                {tasksOnDay.length === 0 ? (
                  <p className="text-muted-foreground text-sm">해당 날짜에 마감인 할일이 없습니다.</p>
                ) : (
                  <ul className="space-y-2">
                    {tasksOnDay.map((t: any) => (
                      <li key={t.id} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
                        <input type="checkbox" checked={t.isCompleted} readOnly className="size-4 rounded" />
                        <span className={t.isCompleted ? "text-muted-foreground line-through" : ""}>{t.title}</span>
                        <Link href={`/tasks/${t.id}`} className="ml-auto text-primary text-xs hover:underline">
                          보기
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">메모</CardTitle>
                <p className="text-muted-foreground text-sm font-normal">해당 날짜에 대한 메모를 적어두면 Daily Report로 활용할 수 있습니다.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea
                  placeholder="메모를 입력하세요..."
                  value={memoContent}
                  onChange={(e: any) => setMemoContent(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <Button size="sm" onClick={saveMemo} disabled={memoSaving}>
                  {memoSaving ? "저장 중..." : "메모 저장"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      </div>

      <ScheduleDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        event={selectedEvent}
        onClose={handleCloseModal}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
      <CreateScheduleModal
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        onCreated={() => {
          revalidateSchedules();
          void mutateInvites();
          void mutateLeave();
          setCreateOpen(false);
          setCreateSlot(null);
          setDefaultInviteUserIdsForCreate(null);
        }}
        defaultStart={createSlot?.start}
        defaultEnd={createSlot?.end}
        defaultInviteUserIds={defaultInviteUserIdsForCreate ?? undefined}
      />
      <CreateTaskModal
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        onCreated={() => {
          void mutateTasks();
          void mutateDiaryTasks();
          void mutateCalendarDueTasks();
          setCreateTaskOpen(false);
        }}
        defaultAssignedToId={session?.user?.id ?? null}
      />
    </div>
  );
}
