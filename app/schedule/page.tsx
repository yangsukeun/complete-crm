"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { jsonFetcher, SWR_KEYS } from "@/lib/api-swr";
import { EVENT_PALETTE, type CalendarLayerId } from "@/lib/schedule-colors";
import {
  eachKstYmdInclusive,
  formatKstYmdLongKo,
  todayYmdKst,
  toKstYmd,
} from "@/lib/date-kst";

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
  isSameMonth,
} from "date-fns";
import { ko } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { ScheduleDetailModal } from "@/components/schedule-detail-modal";
import { CreateScheduleModal } from "@/components/create-schedule-modal";
import { CreateTaskModal } from "@/components/create-task-modal";
import { ScheduleTaskList } from "@/components/schedule-task-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  CalendarClock,
  ListTodo,
  FileText,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  Palmtree,
  Clock,
  Link2,
  Copy,
  RefreshCw,
  Upload,
  Trash2,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PROJECT_STATUS_CHIP,
  normalizeProjectStatus,
  type ProjectStatusKey,
} from "@/lib/project-status-color";
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

type TaskWorkflowStatus = "TODO" | "IN_PROGRESS" | "DONE";

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
  /** 연결된 브랜드 프로젝트 상태(캘린더 마감 칩) */
  projectStatus?: ProjectStatusKey | null;
  /** Task 워크플로 상태 — 마감 칩 색·토글(캘린더 마감 레이어는 Task 기준) */
  taskStatus?: TaskWorkflowStatus | null;
  /** 프로젝트에 연결된 할일 여부(표시 접두어) */
  taskProjectId?: string | null;
};

function normalizeTaskWorkflowStatus(v: string | null | undefined): TaskWorkflowStatus {
  if (v === "IN_PROGRESS" || v === "DONE") return v;
  return "TODO";
}

const TASK_DUE_CHIP: Record<
  TaskWorkflowStatus,
  { bg: string; light: string; text: string; border: string; ddayAccent: string }
> = {
  TODO: {
    bg: "#FEF3C7",
    light: "#FEF3C7",
    text: "#78350F",
    border: "#F59E0B",
    ddayAccent: "#F59E0B",
  },
  IN_PROGRESS: {
    bg: "#DBEAFE",
    light: "#DBEAFE",
    text: "#1E3A8A",
    border: "#3B82F6",
    ddayAccent: "#3B82F6",
  },
  DONE: {
    bg: "#F3F4F6",
    light: "#F3F4F6",
    text: "#374151",
    border: "#6B7280",
    ddayAccent: "#6B7280",
  },
};

type CompletedProjectDisplayMode = "dimmed" | "hidden" | "normal";

/** 바깥 .rbc-event 에 opacity 0.4 — 완료(DONE)·레거시 프로젝트 COMPLETED, 표시 모드가 dimmed 일 때만 */
function shouldDimTaskDueWrapper(
  event: ScheduleEvent,
  displayMode: CompletedProjectDisplayMode
): boolean {
  if (displayMode !== "dimmed") return false;
  if (!(event.isTaskDue || (typeof event.id === "string" && event.id.startsWith("task-due")))) {
    return false;
  }
  const ts = event.taskStatus != null ? normalizeTaskWorkflowStatus(event.taskStatus) : null;
  if (ts === "DONE") return true;
  if (event.projectStatus === "COMPLETED") return true;
  return false;
}

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

/**
 * 외부 캘린더 자동 재조회 주기.
 * Google·네이버 모두 변경 알림(웹훅)을 주지 않으므로 폴링으로만 최신화할 수 있습니다.
 */
const EXTERNAL_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
/** 창 복귀 시 과도한 재조회 방지 */
const EXTERNAL_REFRESH_MIN_GAP_MS = 30 * 1000;

const DEFAULT_VISIBLE_CALENDARS: Record<CalendarLayerId, boolean> = {
  personal: true,
  team: true,
  holiday: true,
  google: true,
  naver: true,
  taskDue: true,
};

function tasksToCalendarDueEvents(
  tasks: {
    id: string;
    title: string;
    dueDate: string | null;
    isCompleted: boolean;
    status?: string | null;
    projectId?: string | null;
    projectStatus?: string | null;
  }[],
  now: Date
): ScheduleEvent[] {
  const sod = startOfDay(now);
  return tasks
    .filter((t): t is typeof t & { dueDate: string } => Boolean(t.dueDate && t.dueDate !== ""))
    .map((t) => {
    const d = startOfDay(new Date(t.dueDate));
    const end = endOfDay(new Date(t.dueDate));
    const ts = normalizeTaskWorkflowStatus(t.status ?? undefined);
    const done = ts === "DONE" || t.isCompleted;
    const overdue = !done && d < sod;
    const prefix = t.projectId != null && t.projectId !== "" ? "[프로젝트]" : "[업무]";
    return {
      id: `task-due-${t.id}`,
      title: `${prefix} ${t.title}`,
      start: d,
      end,
      allDay: true,
      calendarId: "taskDue",
      isTaskDue: true,
      taskDueOverdue: overdue,
      taskDueCompleted: t.isCompleted,
      taskDueDate: t.dueDate,
      projectStatus: normalizeProjectStatus(t.projectStatus ?? null),
      taskStatus: ts,
      taskProjectId: t.projectId ?? null,
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
  isOffRange,
  holidayName,
}: {
  label: string;
  date: Date;
  drilldownView?: string;
  onDrillDown?: (e: React.MouseEvent) => void;
  isOffRange?: boolean;
  /** 공휴일명 — 있으면 숫자 빨강 + 상단 11px 라벨 (바 이벤트 대체) */
  holidayName?: string | null;
}) {
  const isToday = isSameDay(date, new Date());
  const dow = getDay(date);
  const isSat = dow === 6;
  const isSun = dow === 0;
  const legal = Boolean(holidayName) || isLegalHoliday(date);
  const className = legal
    ? "rbc-date-cell--legal-holiday"
    : isSun
      ? "rbc-date-cell--sunday"
      : isSat
        ? "rbc-date-cell--saturday"
        : "";
  const content = (
    <div className="flex w-full min-w-0 flex-col items-center gap-0.5 px-0.5 pt-0.5">
      {holidayName ? (
        <span
          className="schedule-gcal-holiday-label w-full truncate text-center text-[11px] font-medium leading-tight text-[#d93025]"
          title={holidayName}
        >
          {holidayName}
        </span>
      ) : null}
      {isToday ? (
        <>
          <span className="schedule-gcal-today-badge" aria-current="date">
            {label}
          </span>
          <span className="schedule-gcal-today-label">오늘</span>
        </>
      ) : (
        <div
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full text-sm",
            className,
            legal && "font-semibold text-[#d93025]",
            isOffRange && "scale-[0.92] text-[#9aa0a6] dark:text-[#80868b]"
          )}
        >
          {label}
        </div>
      )}
    </div>
  );
  if (drilldownView && onDrillDown) {
    return (
      <button type="button" className="rbc-button-link w-full" onClick={onDrillDown}>
        {content}
      </button>
    );
  }
  return content;
}

function createDateHeader(opts: {
  holidayByYmd: Record<string, string>;
  showHoliday: boolean;
}) {
  return function DateHeaderBound(props: {
    label: string;
    date: Date;
    drilldownView?: string;
    onDrillDown?: (e: React.MouseEvent) => void;
    isOffRange?: boolean;
  }) {
    const ymd = toKstYmd(props.date);
    const holidayName = opts.showHoliday ? (opts.holidayByYmd[ymd] ?? null) : null;
    return <CustomDateHeader {...props} holidayName={holidayName} />;
  };
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

type LeaveDayEntry = { leaveId: string; userId: string; type: string; display: string };

function dedupeLeaveDayEntries(arr: LeaveDayEntry[]): LeaveDayEntry[] {
  const seen = new Set<string>();
  const out: LeaveDayEntry[] = [];
  for (const e of arr) {
    const k = e.leaveId;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out.sort((a, b) => a.display.localeCompare(b.display, "ko"));
}

/** RBC가 document에 건 슬롯 선택(mousedown/touchstart)이 휴가 줄까지 이어져 일정 생성이 같이 뜨는 것 방지 */
function stopCalendarSlotPointerChain(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function leaveTypeChipClass(type: string): string {
  if (type === "ANNUAL") {
    return "border border-blue-200/90 bg-blue-100/95 text-blue-900 shadow-sm hover:bg-blue-200/90 dark:border-blue-700 dark:bg-blue-950/70 dark:text-blue-100 dark:hover:bg-blue-900/55";
  }
  if (type.startsWith("HALF_") || type.startsWith("QUARTER_")) {
    return "border border-amber-200/90 bg-amber-50/95 text-amber-950 shadow-sm hover:bg-amber-100/95 dark:border-amber-800/80 dark:bg-amber-950/45 dark:text-amber-100 dark:hover:bg-amber-900/40";
  }
  if (type === "SICK_PAID") {
    return "border border-emerald-200/90 bg-emerald-50/95 text-emerald-950 shadow-sm hover:bg-emerald-100/90 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/35";
  }
  if (type === "SICK_UNPAID") {
    return "border border-neutral-200/90 bg-neutral-100/95 text-neutral-900 shadow-sm hover:bg-neutral-200/80 dark:border-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-100 dark:hover:bg-neutral-700/70";
  }
  return "border border-blue-200/90 bg-blue-100/95 text-blue-900 shadow-sm hover:bg-blue-200/90 dark:border-blue-700 dark:bg-blue-950/70 dark:text-blue-100 dark:hover:bg-blue-900/55";
}

function LeaveTypeIcon({ type }: { type: string }) {
  const iconCls = "size-3 shrink-0 text-current opacity-85";
  if (type === "SICK_PAID" || type === "SICK_UNPAID") {
    return <Stethoscope className={iconCls} aria-hidden />;
  }
  if (type.startsWith("HALF_") || type.startsWith("QUARTER_")) {
    return <Clock className={iconCls} aria-hidden />;
  }
  return <Palmtree className={iconCls} aria-hidden />;
}

function DateCellLeaveFooter({
  entries,
  onLeaveClick,
  onLeavePointerSession,
}: {
  entries: LeaveDayEntry[];
  onLeaveClick: (leaveId: string) => void;
  onLeavePointerSession?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const swallowLeavePointer = (e: React.SyntheticEvent) => {
    onLeavePointerSession?.();
    stopCalendarSlotPointerChain(e);
  };

  if (entries.length === 0) return null;

  const hasHalfOrQuarter = entries.some(
    (e) => e.type.startsWith("HALF_") || e.type.startsWith("QUARTER_")
  );
  const chipLabel = hasHalfOrQuarter
    ? `휴가·반차 ${entries.length}명`
    : `휴가 ${entries.length}명`;

  return (
    <div
      data-leave-footer
      className="rbc-date-cell-leave-footer mt-auto w-full max-w-full shrink-0 border-t border-blue-200/80 bg-blue-50/70 px-1 py-1 dark:border-blue-800/60 dark:bg-blue-950/35"
      aria-label={entries.map((x) => x.display).join(", ")}
      onPointerDownCapture={swallowLeavePointer}
      onMouseDown={swallowLeavePointer}
      onTouchStart={swallowLeavePointer}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-leave-item
            className="mx-auto flex w-full max-w-full cursor-pointer items-center justify-center gap-1 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-900 shadow-sm hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-100 dark:hover:bg-blue-900/50"
            onPointerDownCapture={swallowLeavePointer}
            onMouseDown={swallowLeavePointer}
            onTouchStart={swallowLeavePointer}
            onClick={(e) => e.stopPropagation()}
          >
            <Palmtree className="size-3 shrink-0 opacity-80" aria-hidden />
            <span className="truncate">{chipLabel}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 p-2"
          align="center"
          onPointerDownCapture={swallowLeavePointer}
          onMouseDown={swallowLeavePointer}
          onTouchStart={swallowLeavePointer}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-muted-foreground mb-2 text-xs">해당일 휴가 ({entries.length}명)</p>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {entries.map((en, i) => (
              <li key={`${en.userId}-all-${i}`}>
                <button
                  type="button"
                  data-leave-item
                  className={cn(
                    "flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors",
                    leaveTypeChipClass(en.type)
                  )}
                  onPointerDownCapture={swallowLeavePointer}
                  onMouseDown={swallowLeavePointer}
                  onTouchStart={swallowLeavePointer}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    onLeaveClick(en.leaveId);
                  }}
                >
                  <LeaveTypeIcon type={en.type} />
                  <span className="min-w-0 flex-1 truncate">{en.display}</span>
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function createDateCellWrapper(
  leaveByDate: Record<string, LeaveDayEntry[]>,
  onLeaveClick: (leaveId: string) => void,
  onLeavePointerSession: (() => void) | undefined,
  calendarMonthDate: Date
) {
  return function DateCellWrapper({ value, children }: { value: Date; children: React.ReactNode; range?: Date[] }) {
    const key = toKstYmd(value);
    const entries = leaveByDate[key] ?? [];
    const offMonth = !isSameMonth(value, calendarMonthDate);
    const monthStart = isSameMonth(value, calendarMonthDate) && value.getDate() === 1;
    const isToday = isSameDay(value, new Date());
    return (
      <div
        className={cn(
          "rbc-date-cell-wrapper-inner schedule-gcal-month-cell flex h-full min-h-[140px] min-w-0 flex-col overflow-hidden",
          offMonth && "schedule-gcal-off-month",
          monthStart && "schedule-gcal-month-start",
          isToday && "schedule-gcal-day-today"
        )}
        /* rbc-row-bg 의 flex 자식은 원래 .rbc-day-bg 가 flex:1 0 0% — 래퍼가 그 역할을 해야 요일별로 셀이 갈라짐 */
        style={{ flex: "1 1 0%", minWidth: 0 }}
      >
        <div className="rbc-date-cell-bg-area min-h-0 flex-1 overflow-hidden">{children}</div>
        {entries.length > 0 ? (
          <DateCellLeaveFooter
            entries={entries}
            onLeaveClick={onLeaveClick}
            onLeavePointerSession={onLeavePointerSession}
          />
        ) : null}
      </div>
    );
  };
}

function scheduleLeaveStatusLabel(s: string): string {
  if (s === "PENDING") return "1차 대기";
  if (s === "TEAM_LEAD_APPROVED") return "2차 대기";
  if (s === "APPROVED") return "승인";
  if (s === "CANCEL_REQUESTED") return "취소 요청";
  if (s === "CANCELLED") return "취소 완료";
  if (s === "REJECTED") return "반려";
  return s;
}

function getDday(
  dueDate: string,
  opts: { isTaskDue?: boolean; taskStatus?: TaskWorkflowStatus | null; projectStatus?: ProjectStatusKey | null } = {}
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isTaskDue = opts.isTaskDue === true;
  const tw = opts.taskStatus != null ? normalizeTaskWorkflowStatus(opts.taskStatus) : null;
  if (isTaskDue && tw != null) {
    const chip = TASK_DUE_CHIP[tw];
    if (diff < 0) {
      if (tw === "DONE") return { label: `D+${Math.abs(diff)}`, color: chip.ddayAccent };
      return { label: `D+${Math.abs(diff)}`, color: "#d93025" };
    }
    if (diff === 0) return { label: "D-Day", color: chip.ddayAccent };
    return { label: `D-${diff}`, color: chip.ddayAccent };
  }
  const st = normalizeProjectStatus(opts.projectStatus ?? null);
  const pal = PROJECT_STATUS_CHIP[st];
  if (diff < 0) return { label: `D+${Math.abs(diff)}`, color: "#d93025" };
  if (diff === 0) return { label: "D-Day", color: pal.accent };
  return { label: `D-${diff}`, color: pal.accent };
}

function paletteForEvent(event: ScheduleEvent): { bg: string; light: string; text: string; border?: string } {
  if (event.isTaskDue || (typeof event.id === "string" && event.id.startsWith("task-due"))) {
    const tw = normalizeTaskWorkflowStatus(event.taskStatus ?? undefined);
    if (event.taskDueOverdue && tw !== "DONE") {
      return { bg: "#b71c1c", light: "#ffebee", text: "#b71c1c", border: "#b71c1c" };
    }
    const p = TASK_DUE_CHIP[tw];
    return { bg: p.bg, light: p.light, text: p.text, border: p.border };
  }
  if (event.calendarId === "holiday" || (typeof event.id === "string" && event.id.startsWith("hol-"))) {
    return EVENT_PALETTE.holiday;
  }
  if (event.calendarId === "google") return EVENT_PALETTE.google;
  if (event.calendarId === "naver") return EVENT_PALETTE.naver;
  if (event.calendarId === "personal") return EVENT_PALETTE.personal;
  if (event.calendarId === "team") return EVENT_PALETTE.team;
  return EVENT_PALETTE.personal;
}

function layerDotColor(event: ScheduleEvent): string {
  if (event.isTaskDue || String(event.id).startsWith("task-due")) {
    return EVENT_PALETTE.taskDue.bg;
  }
  if (event.calendarId === "team") return EVENT_PALETTE.team.bg;
  if (event.calendarId === "google") return EVENT_PALETTE.google.bg;
  if (event.calendarId === "naver") return EVENT_PALETTE.naver.bg;
  return EVENT_PALETTE.personal.bg;
}

/** 월간 셀 표시 우선순위: 할일마감 > 종일/멀티데이 > 시간 일정 */
function monthEventSortPriority(e: ScheduleEvent): number {
  if (e.isTaskDue || String(e.id).startsWith("task-due")) return 0;
  if (e.allDay || !isSameDay(e.start, e.end)) return 1;
  return 2;
}

function compareMonthEventPriority(a: ScheduleEvent, b: ScheduleEvent): number {
  const d = monthEventSortPriority(a) - monthEventSortPriority(b);
  if (d !== 0) return d;
  return a.start.getTime() - b.start.getTime();
}

function stripCalendarEmoji(title: string): string {
  return title.replace(/^📅\s*/u, "").trim();
}

function ScheduleCalendarEvent({
  event,
  title,
  isAllDay: allDayAccessor,
  dimOffMonth,
}: {
  event: ScheduleEvent;
  title: string;
  isAllDay?: boolean;
  continuesPrior?: boolean;
  continuesAfter?: boolean;
  localizer?: unknown;
  slotStart?: Date;
  slotEnd?: Date;
  /** 월 뷰에서 슬롯 날짜가 보고 있는 달 밖이면 흐리게 */
  dimOffMonth?: boolean;
}) {
  const pal = paletteForEvent(event);
  const isAllDay = Boolean(allDayAccessor || event.allDay);
  const isTaskDueChip = Boolean(event.isTaskDue || String(event.id).startsWith("task-due"));
  /** 외부 캘린더(Google·네이버)는 연한 배경 + 컬러 텍스트로 CRM 일정과 구분 */
  const isExternal = event.calendarId === "google" || event.calendarId === "naver";
  const displayTitle = stripCalendarEmoji(title);
  const startTime = format(event.start, "HH:mm", { locale: ko });
  const dday =
    event.taskDueDate != null && isTaskDueChip
      ? getDday(event.taskDueDate, {
          isTaskDue: true,
          taskStatus: event.taskStatus ?? null,
          projectStatus: event.projectStatus ?? null,
        })
      : null;

  /* 시간 일정: 배경 바 없이 ● HH:MM 제목 */
  if (!isAllDay) {
    return (
      <div
        className={cn(
          "schedule-gcal-event-chip schedule-gcal-event-chip--timed-dot",
          isExternal && "schedule-gcal-event-chip--google",
          dimOffMonth && "schedule-gcal-event-chip--off-month"
        )}
      >
        <div className="schedule-gcal-event-chip__row">
          <span
            className="schedule-gcal-event-dot"
            style={{ background: layerDotColor(event) }}
            aria-hidden
          />
          <span className="schedule-gcal-event-chip__title schedule-gcal-event-chip__title--timed">
            <span className="schedule-gcal-event-time">{startTime}</span>
            {displayTitle}
          </span>
        </div>
      </div>
    );
  }

  /* 종일·멀티데이·할일마감: 얇은 바 */
  return (
    <div
      className={cn(
        "schedule-gcal-event-chip",
        "schedule-gcal-event-chip--allday",
        isTaskDueChip && "schedule-gcal-event-chip--task-due",
        isExternal && !isTaskDueChip && "schedule-gcal-event-chip--google",
        dimOffMonth && "schedule-gcal-event-chip--off-month"
      )}
      style={
        isTaskDueChip
          ? {
              background: "#fce8e6",
              color: "#c62828",
              borderLeft: `3px solid ${
                event.taskDueOverdue ? "#b71c1c" : (pal.border ?? EVENT_PALETTE.taskDue.bg)
              }`,
            }
          : isExternal
            ? {
                background: pal.light,
                color: pal.text,
              }
            : {
                background: pal.bg,
                color: pal.text,
              }
      }
    >
      <div className="schedule-gcal-event-chip__row">
        <span className="schedule-gcal-event-chip__title">{displayTitle}</span>
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
  dueDate: string | null;
  isCompleted: boolean;
  priority: string;
  assignees?: { id: string; name: string; position?: string | null; image?: string | null }[];
  assignedTo: { id?: string; name: string; position?: string | null; image?: string | null } | null;
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
  reason?: string | null;
  user: { id: string; name: string; position?: string | null };
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
  naver: "네이버 캘린더",
  /** 캘린더 칩: Task 마감일(프로젝트에 연결된 할일 포함). 브랜드 ‘프로젝트’ 엔티티와 구분 */
  taskDue: "할일 마감",
};

const CALENDAR_CHIP_COLORS: Record<CalendarLayerId, string> = {
  personal: EVENT_PALETTE.personal.bg,
  team: EVENT_PALETTE.team.bg,
  holiday: EVENT_PALETTE.holiday.bg,
  google: EVENT_PALETTE.google.bg,
  naver: EVENT_PALETTE.naver.bg,
  taskDue: EVENT_PALETTE.taskDue.bg,
};

/** 「표시」 드롭다운에 나열할 순서 */
const CALENDAR_LAYER_ORDER: CalendarLayerId[] = [
  "personal",
  "team",
  "holiday",
  "google",
  "naver",
  "taskDue",
];

const COMPLETED_DISPLAY_OPTIONS: { id: CompletedProjectDisplayMode; label: string; hint: string }[] = [
  { id: "dimmed", label: "반투명", hint: "흐리게 보임" },
  { id: "hidden", label: "숨김", hint: "캘린더에서 제외" },
  { id: "normal", label: "선명", hint: "일반 일정처럼" },
];

type ScheduleHeaderProps = {
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
  /** Google·네이버 중 하나라도 연결됨 — 연동 버튼에 표시점 */
  anyIntegrationConnected: boolean;
  onOpenIntegrations: () => void;
  onNewSchedule: () => void;
  visibleCalendars: Record<CalendarLayerId, boolean>;
  onToggleCalendarLayer: (layer: CalendarLayerId, visible: boolean) => void;
  completedProjectDisplay: CompletedProjectDisplayMode;
  onCompletedProjectDisplayChange: (mode: CompletedProjectDisplayMode) => void;
};

function ScheduleHeader({
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
  anyIntegrationConnected,
  onOpenIntegrations,
  onNewSchedule,
  visibleCalendars,
  onToggleCalendarLayer,
  completedProjectDisplay,
  onCompletedProjectDisplayChange,
}: ScheduleHeaderProps) {
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

  const handleSelectMonth = useCallback(
    (year: number, month: number) => {
      onCalendarNavigate(Navigate.DATE, new Date(year, month, 1));
      setPickerOpen(false);
    },
    [onCalendarNavigate]
  );

  const hiddenLayerCount = CALENDAR_LAYER_ORDER.filter(
    (layer) => visibleCalendars[layer] === false
  ).length;

  return (
    <header className="sticky top-0 z-20 border-b border-[#e5e7eb] bg-white dark:border-border dark:bg-background">
      {/* 1단: 페이지 이동 + 주요 동작 */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-5">
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

        {showCalendarNav && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              title="Google·네이버 캘린더 연동"
              className="h-9 shrink-0 border-[#e0e0e0] text-[#3c4043] dark:border-border"
              onClick={onOpenIntegrations}
            >
              <Link2 className="mr-1.5 size-4" />
              <span className="hidden sm:inline">캘린더 연동</span>
              {anyIntegrationConnected && (
                <span className="ml-1.5 size-1.5 rounded-full bg-[#03c75a]" aria-label="연결됨" />
              )}
            </Button>
            <Button
              size="sm"
              className="h-9 shrink-0 bg-[#1a73e8] hover:bg-[#1557b0]"
              onClick={onNewSchedule}
            >
              <Plus className="mr-1.5 size-4" />
              <span className="hidden sm:inline">새 일정</span>
            </Button>
          </div>
        )}
      </div>

      {/* 2단: 기간 이동 + 표시 항목 (일정 탭에서만) */}
      {showCalendarNav && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f1f3f4] px-4 py-2 dark:border-border/60 md:px-5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:gap-3">
            <button
              type="button"
              className="shrink-0 rounded-full border border-[#e0e0e0] bg-white px-4 py-1.5 text-sm font-medium text-[#3c4043] transition-colors hover:bg-[#f8f9fa] dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted/60"
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
                className="schedule-gcal-month-title text-left text-base font-normal leading-tight text-[#3c4043] hover:underline dark:text-foreground md:text-[20px] md:font-normal"
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
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 border-[#e0e0e0] text-[#3c4043] dark:border-border"
                >
                  <SlidersHorizontal className="mr-1.5 size-4" />
                  표시
                  {hiddenLayerCount > 0 && (
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      {CALENDAR_LAYER_ORDER.length - hiddenLayerCount}/{CALENDAR_LAYER_ORDER.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                <p className="text-muted-foreground px-2 pb-1 pt-1.5 text-xs font-semibold">
                  캘린더
                </p>
                {CALENDAR_LAYER_ORDER.map((layer) => {
                  const on = visibleCalendars[layer] !== false;
                  return (
                    <button
                      key={layer}
                      type="button"
                      onClick={() => onToggleCalendarLayer(layer, !on)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{
                          background: on ? CALENDAR_CHIP_COLORS[layer] : "transparent",
                          boxShadow: `inset 0 0 0 1.5px ${CALENDAR_CHIP_COLORS[layer]}`,
                        }}
                        aria-hidden
                      />
                      <span className={cn("flex-1 text-left", !on && "text-muted-foreground")}>
                        {CALENDAR_LAYER_LABELS[layer]}
                      </span>
                      {on && <Check className="size-4 shrink-0 text-[#1a73e8]" />}
                    </button>
                  );
                })}

                <div className="my-1.5 border-t" />
                <p className="text-muted-foreground px-2 pb-1 text-xs font-semibold">
                  완료된 마감
                </p>
                {COMPLETED_DISPLAY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onCompletedProjectDisplayChange(opt.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                  >
                    <span className="flex-1 text-left">
                      {opt.label}
                      <span className="text-muted-foreground ml-1.5 text-xs">{opt.hint}</span>
                    </span>
                    {completedProjectDisplay === opt.id && (
                      <Check className="size-4 shrink-0 text-[#1a73e8]" />
                    )}
                  </button>
                ))}

                <div className="my-1.5 border-t" />
                <p className="text-muted-foreground px-2 pb-1 text-xs font-semibold">
                  할일 마감 색
                </p>
                <div className="text-muted-foreground flex flex-col gap-1 px-2 pb-1 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden>🟠</span> 대기 (TODO)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden>🔵</span> 진행중 (IN_PROGRESS)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <svg width="8" height="8" viewBox="0 0 8 8" className="opacity-40" aria-hidden>
                      <circle cx="4" cy="4" r="4" fill="#6B7280" />
                    </svg>
                    완료 (DONE)
                  </span>
                </div>
              </PopoverContent>
            </Popover>

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
          </div>
        </div>
      )}
    </header>
  );
}

type LeaveApiResponse = { requests?: LeaveRequestItem[] };

function SchedulePageInner() {
  const [tab, setTab] = useState<TabId>("schedule");
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(new Date());
  const [diaryDate, setDiaryDate] = useState(() => todayYmdKst());
  const [memoContent, setMemoContent] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSlot, setCreateSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [defaultInviteUserIdsForCreate, setDefaultInviteUserIdsForCreate] = useState<string[] | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [leaveDetailId, setLeaveDetailId] = useState<string | null>(null);
  /** 휴가 줄 포인터 직후 RBC onSelectSlot 이 한 번 열리는 것 방지 */
  const blockSlotOpenFromLeaveUntilMs = useRef(0);
  const markLeavePointerSession = useCallback(() => {
    blockSlotOpenFromLeaveUntilMs.current = Date.now() + 600;
  }, []);
  const [googleEvents, setGoogleEvents] = useState<ScheduleEvent[]>([]);
  const [naverEvents, setNaverEvents] = useState<ScheduleEvent[]>([]);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [naverIdInput, setNaverIdInput] = useState("");
  const [naverPasswordInput, setNaverPasswordInput] = useState("");
  const [naverConnecting, setNaverConnecting] = useState(false);
  const [naverIcsUploading, setNaverIcsUploading] = useState(false);
  /** 외부 캘린더(Google·네이버) 재조회 트리거 — 주기 폴링·창 복귀·수동 새로고침 */
  const [externalRefreshKey, setExternalRefreshKey] = useState(0);
  const lastExternalRefreshAtRef = useRef(0);
  const naverIcsInputRef = useRef<HTMLInputElement>(null);
  const [icalFeedUrl, setIcalFeedUrl] = useState("");
  const [icalWebcalUrl, setIcalWebcalUrl] = useState("");
  const [icalLoading, setIcalLoading] = useState(false);
  const [icalRegenerating, setIcalRegenerating] = useState(false);
  /** 서버·클라이언트 초기값 동일(localStorage는 마운트 후에만 읽기) → 하이드레이션 불일치 방지 */
  const [visibleCalendars, setVisibleCalendars] = useState<Record<CalendarLayerId, boolean>>(
    DEFAULT_VISIBLE_CALENDARS
  );
  useEffect(() => {
    setVisibleCalendars(loadVisibleCalendars());
  }, []);

  const COMPLETED_PROJECT_DISPLAY_KEY = "schedule.hideCompletedProjects";
  const loadCompletedProjectDisplay = (): CompletedProjectDisplayMode => {
    if (typeof window === "undefined") return "dimmed";
    try {
      const v = localStorage.getItem(COMPLETED_PROJECT_DISPLAY_KEY);
      if (v === "hidden" || v === "normal" || v === "dimmed") return v;
      return "dimmed";
    } catch {
      return "dimmed";
    }
  };
  const [completedProjectDisplay, setCompletedProjectDisplay] = useState<CompletedProjectDisplayMode>("dimmed");
  useEffect(() => {
    setCompletedProjectDisplay(loadCompletedProjectDisplay());
  }, []);

  const applyCompletedProjectDisplay = useCallback((mode: CompletedProjectDisplayMode) => {
    setCompletedProjectDisplay(mode);
    try {
      localStorage.setItem(COMPLETED_PROJECT_DISPLAY_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const [narrowViewport, setNarrowViewport] = useState(false);
  const [mobileWeekBannerDismissed, setMobileWeekBannerDismissed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setNarrowViewport(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const { data: session } = useSession();
  const router = useRouter();

  type SchedBundle = { personal?: unknown[]; team?: unknown[]; from?: string; to?: string };
  const scheduleBundleRange = useMemo(() => {
    const from = startOfMonth(new Date(date.getFullYear(), date.getMonth() - 1, 1));
    const to = endOfMonth(new Date(date.getFullYear(), date.getMonth() + 1, 1));
    return {
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }, [date]);
  const schedulesBundleKey = session?.user
    ? `/api/schedules/bundle?from=${encodeURIComponent(scheduleBundleRange.from)}&to=${encodeURIComponent(scheduleBundleRange.to)}`
    : null;
  const {
    data: schedBundle,
    mutate: mutateSchedBundle,
    isLoading: bundleLoading,
  } = useSWR<SchedBundle>(schedulesBundleKey, jsonFetcher, {
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
        ? `/api/tasks?calendarDue=1&standalone=1&creationSource=SCHEDULE,PROJECT,UNKNOWN,MINDMAP&monthKey=${format(date, "yyyy-MM")}`
        : `/api/tasks?calendarDue=1&standalone=1&creationSource=SCHEDULE,PROJECT,UNKNOWN,MINDMAP&weekKey=${format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd")}`
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
  const taskDueEvents = useMemo(() => {
    const raw =
      (calendarDueRaw as {
        id: string;
        title: string;
        dueDate: string;
        isCompleted: boolean;
        status?: string | null;
        projectId?: string | null;
        projectStatus?: string | null;
      }[]) ?? [];
    const hideCompletedRow = (t: (typeof raw)[number]) => {
      if (normalizeTaskWorkflowStatus(t.status ?? undefined) === "DONE") return true;
      if (t.isCompleted) return true;
      if (normalizeProjectStatus(t.projectStatus ?? null) === "COMPLETED") return true;
      return false;
    };
    const filtered =
      completedProjectDisplay === "hidden" ? raw.filter((t) => !hideCompletedRow(t)) : raw;
    return tasksToCalendarDueEvents(filtered, new Date());
  }, [calendarDueRaw, completedProjectDisplay]);

  const schedulesLoading = Boolean(session?.user) && bundleLoading;

  // 프로젝트 미연결 할일만 + 미완료 — 할일 탭·일정 상단·일기 해당일
  const tasksAllKey =
    session?.user && (tab === "tasks" || tab === "schedule") ? SWR_KEYS.scheduleStandaloneTasks : null;
  const diaryTasksKey =
    session?.user && tab === "diary"
      ? `/api/tasks?dueDay=${encodeURIComponent(diaryDate)}&projectId=null&status=TODO,IN_PROGRESS&excludeProjectTitleMatch=1&creationSource=SCHEDULE,UNKNOWN`
      : null;
  const { data: tasksRaw, mutate: mutateTasks } = useSWR(tasksAllKey, jsonFetcher, {
    dedupingInterval: 300_000,
    revalidateOnFocus: false,
    revalidateIfStale: false, // [PERF-claude-code] 캐시 존재 시 리마운트로 재검증 안 함
  });
  const { data: diaryTasksRaw, mutate: mutateDiaryTasks } = useSWR(
    diaryTasksKey,
    jsonFetcher,
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );
  const tasks = useMemo((): TaskItem[] => {
    const rawSource = tab === "diary" ? diaryTasksRaw : tab === "tasks" || tab === "schedule" ? tasksRaw : null;
    if (rawSource == null) return [];
    const raw = rawSource as unknown[] | { items?: unknown[] };
    const list = (Array.isArray(raw) ? raw : raw.items ?? []) as {
      id: string;
      title: string;
      dueDate: string | null;
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

  const handleScheduleTaskCompleted = useCallback(
    async (taskId: string) => {
      const strip = <T,>(prev: T): T => {
        if (prev == null) return prev;
        if (Array.isArray(prev)) {
          return prev.filter((t: { id?: string }) => t?.id !== taskId) as T;
        }
        if (typeof prev === "object") {
          const p = prev as unknown as { items?: { id?: string }[] };
          if (Array.isArray(p.items)) {
            return { ...p, items: p.items.filter((t) => t?.id !== taskId) } as T;
          }
        }
        return prev;
      };
      await mutateTasks(strip, { revalidate: true });
      void mutateCalendarDueTasks();
      void mutateDiaryTasks();
    },
    [mutateTasks, mutateCalendarDueTasks, mutateDiaryTasks]
  );

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

  const { data: gcalStatus, mutate: mutateGcal } = useSWR<{
    connected: boolean;
    needsTasksReauth?: boolean;
    authUrl?: string;
  }>(
    session?.user && tab === "schedule" ? SWR_KEYS.googleCalendar : null,
    jsonFetcher,
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );
  const googleConnected = gcalStatus?.connected ?? false;

  const { data: naverStatus, mutate: mutateNaver } = useSWR<{ connected: boolean; configured?: boolean }>(
    session?.user && tab === "schedule" ? SWR_KEYS.naverCalendar : null,
    jsonFetcher,
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );
  const naverConnected = naverStatus?.connected ?? false;
  const naverConfigured = naverStatus?.configured !== false;

  const { data: naverCalDavStatus, mutate: mutateNaverCalDav } = useSWR<{
    connected: boolean;
    configured?: boolean;
    naverId?: string | null;
    lastSyncedAt?: string | null;
    lastError?: string | null;
    importedCount?: number;
  }>(session?.user && tab === "schedule" ? SWR_KEYS.naverCalDav : null, jsonFetcher, {
    dedupingInterval: 60_000,
    revalidateOnFocus: false,
  });
  const naverReadConnected = naverCalDavStatus?.connected ?? false;
  const naverReadConfigured = naverCalDavStatus?.configured !== false;
  const naverImportedCount = naverCalDavStatus?.importedCount ?? 0;
  const naverHasReadSource = naverReadConnected || naverImportedCount > 0;

  const revalidateSchedules = useCallback(() => {
    void mutateSchedBundle();
  }, [mutateSchedBundle]);

  useEffect(() => {
    const onWorkspaceChange = () => revalidateSchedules();
    window.addEventListener("workspace-changed", onWorkspaceChange);
    return () => window.removeEventListener("workspace-changed", onWorkspaceChange);
  }, [revalidateSchedules]);

  const refreshExternalCalendars = useCallback((minGapMs = 0) => {
    const now = Date.now();
    if (minGapMs > 0 && now - lastExternalRefreshAtRef.current < minGapMs) return;
    lastExternalRefreshAtRef.current = now;
    setExternalRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (tab !== "schedule") return;
    const onInterval = () => {
      if (document.visibilityState === "visible") refreshExternalCalendars();
    };
    const onReturn = () => {
      if (document.visibilityState === "visible") {
        refreshExternalCalendars(EXTERNAL_REFRESH_MIN_GAP_MS);
      }
    };
    const timer = window.setInterval(onInterval, EXTERNAL_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [tab, refreshExternalCalendars]);

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
            title: stripCalendarEmoji(String(e.title ?? "")),
            start: new Date(e.start),
            end: new Date(e.end),
            allDay: e.isAllDay,
            calendarId: "google" as const,
          }))
        );
      })
      .catch(() => setGoogleEvents([]));
  }, [googleConnected, tab, view, date, visibleCalendars.google, externalRefreshKey]);

  useEffect(() => {
    if (!naverHasReadSource || tab !== "schedule" || visibleCalendars.naver === false) {
      setNaverEvents([]);
      return;
    }
    const rangeStart = view === "month" ? startOfMonth(date) : startOfWeek(date, { weekStartsOn: 1 });
    const rangeEnd = view === "month" ? endOfMonth(date) : endOfWeek(date, { weekStartsOn: 1 });
    const params = new URLSearchParams({
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
    });
    let cancelled = false;
    fetch(`/api/integrations/naver-calendar/events?${params}`)
      .then(async (r) => {
        if (!r.ok) {
          console.error("[NAVER_CALDAV]", {
            step: "client-events-fetch",
            status: r.status,
            href: `/api/integrations/naver-calendar/events?${params}`,
          });
          return { events: [] as { id: string; title: string; start: string; end: string; isAllDay: boolean }[] };
        }
        return r.json();
      })
      .then((data: { events?: { id: string; title: string; start: string; end: string; isAllDay: boolean }[]; warning?: string | null }) => {
        if (cancelled) return;
        if (data.warning) {
          console.error("[NAVER_CALDAV]", { step: "client-events-warning", warning: data.warning });
        }
        setNaverEvents(
          (data.events ?? []).map((e) => ({
            id: e.id,
            title: stripCalendarEmoji(String(e.title ?? "")),
            start: new Date(e.start),
            end: new Date(e.end),
            allDay: e.isAllDay,
            calendarId: "naver" as const,
          }))
        );
      })
      .catch((err) => {
        console.error("[NAVER_CALDAV]", {
          step: "client-events-catch",
          message: err instanceof Error ? err.message : String(err),
        });
        if (!cancelled) setNaverEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [naverHasReadSource, tab, view, date, visibleCalendars.naver, externalRefreshKey]);

  const handleSelectEvent = useCallback(
    (event: ScheduleEvent) => {
      if (typeof event.id === "string" && event.id.startsWith("task-due-")) {
        router.push(`/tasks/${event.id.slice("task-due-".length)}`);
        return;
      }
      if (
        typeof event.id === "string" &&
        (event.id.startsWith("hol-") || event.id.startsWith("google-") || event.id.startsWith("naver-"))
      ) {
        return;
      }
      setSelectedEvent(event);
      setModalOpen(true);
    },
    [router]
  );

  const searchParams = useSearchParams();
  useEffect(() => {
    const googleConnectedParam = searchParams.get("google_calendar") === "connected";
    const naverConnectedParam = searchParams.get("naver_calendar") === "connected";
    const err = searchParams.get("error");
    if (googleConnectedParam) {
      toast.success("Google 캘린더가 연동되었습니다.");
      void mutateGcal();
      router.replace("/schedule", { scroll: false });
    } else if (naverConnectedParam) {
      toast.success("네이버 캘린더 연동이 완료되었습니다. 새 일정·승인 휴가가 네이버에 등록됩니다.");
      void mutateNaver();
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
    } else if (err === "naver_calendar_not_configured") {
      toast.error("네이버 캘린더 연동이 설정되지 않았습니다. .env에 NAVER_CALENDAR_CLIENT_ID, NAVER_CALENDAR_CLIENT_SECRET을 추가하세요.");
      router.replace("/schedule", { scroll: false });
    } else if (err === "naver_calendar_denied") {
      toast.error("네이버 캘린더 권한을 허용해 주세요.");
      router.replace("/schedule", { scroll: false });
    } else if (err === "naver_calendar_state") {
      toast.error("네이버 로그인 상태가 만료되었습니다. 다시 연동해 주세요.");
      router.replace("/schedule", { scroll: false });
    } else if (err === "naver_calendar_failed") {
      toast.error("네이버 캘린더 연동에 실패했습니다.");
      router.replace("/schedule", { scroll: false });
    }
  }, [searchParams, router, mutateGcal, mutateNaver]);

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
    if (Date.now() < blockSlotOpenFromLeaveUntilMs.current) return;
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

  /** 공휴일명 맵 (월간 날짜 헤더 라벨용 — RBC 이벤트 바 대신) */
  const holidayByYmd = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of holidayEvents) {
      map[toKstYmd(e.start)] = e.title;
    }
    return map;
  }, [holidayEvents]);

  /** 날짜별 승인 휴가 (KST yyyy-MM-dd) — 셀 하단 전용, 사용자별 한 줄 */
  const leaveByDate = useMemo(() => {
    const map: Record<string, LeaveDayEntry[]> = {};
    const approved = leaveRequests.filter((r: LeaveRequestItem) => r.status === "APPROVED");
    for (const r of approved) {
      const name = formatUserName(r.user);
      const kind = calendarLeaveTypeLabel(r.type);
      for (const key of eachKstYmdInclusive(r.startDate, r.endDate)) {
        if (!key) continue;
        if (!map[key]) map[key] = [];
        map[key].push({
          leaveId: r.id,
          userId: r.user.id,
          type: r.type,
          display: `${name} (${kind})`,
        });
      }
    }
    for (const k of Object.keys(map)) {
      map[k] = dedupeLeaveDayEntries(map[k]);
    }
    return map;
  }, [leaveRequests]);

  const dateCellWrapperComponent = useMemo(
    () => createDateCellWrapper(leaveByDate, (id) => setLeaveDetailId(id), markLeavePointerSession, date),
    [leaveByDate, markLeavePointerSession, date]
  );

  const monthEventComponent = useMemo(() => {
    function MonthAwareScheduleEvent(props: {
      event: ScheduleEvent;
      title: string;
      isAllDay?: boolean;
      continuesPrior?: boolean;
      continuesAfter?: boolean;
      localizer?: unknown;
      slotStart?: Date;
      slotEnd?: Date;
    }) {
      const dim =
        view === "month" &&
        props.slotStart != null &&
        !isSameMonth(props.slotStart, date);
      return <ScheduleCalendarEvent {...props} dimOffMonth={dim} />;
    }
    return MonthAwareScheduleEvent;
  }, [date, view]);

  const dateHeaderComponent = useMemo(
    () =>
      createDateHeader({
        holidayByYmd,
        showHoliday: visibleCalendars.holiday !== false,
      }),
    [holidayByYmd, visibleCalendars.holiday]
  );

  const calendarRbcComponents = useMemo(
    () => ({
      dateHeader: dateHeaderComponent as any,
      dateCellWrapper: dateCellWrapperComponent as any,
      event: monthEventComponent as any,
    }),
    [dateHeaderComponent, dateCellWrapperComponent, monthEventComponent]
  );

  const leaveDetail = useMemo(
    () => (leaveDetailId ? leaveRequests.find((r) => r.id === leaveDetailId) ?? null : null),
    [leaveDetailId, leaveRequests]
  );

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
    // 공휴일은 날짜 헤더 라벨로만 표시 (이벤트 바 제외)
    const all = [...personalEvents, ...teamEvents, ...googleEvents, ...naverEvents, ...taskDueEvents];
    const filtered = all.filter((e: any) =>
      e.calendarId ? (visibleCalendars as any)[e.calendarId] !== false : true
    );
    // 같은 날 정렬: 할일마감이 더보기에 숨지 않도록 우선
    // (종일 non-task 시작을 1분 밀어 RBC allDay 정렬에서 마감이 위)
    return filtered
      .map((e) => {
        const title = stripCalendarEmoji(e.title);
        if (e.isTaskDue || String(e.id).startsWith("task-due")) {
          return { ...e, title, start: startOfDay(e.start) };
        }
        if (e.allDay) {
          const s = startOfDay(e.start);
          s.setMinutes(1);
          return { ...e, title, start: s };
        }
        return title === e.title ? e : { ...e, title };
      })
      .sort(compareMonthEventPriority);
  }, [personalEvents, teamEvents, googleEvents, naverEvents, taskDueEvents, visibleCalendars]);

  const diaryDayStart = startOfDay(new Date(diaryDate));
  const diaryDayEnd = endOfDay(new Date(diaryDate));
  const eventsOnDay = displayEvents.filter(
    (e: any) => (e.start >= diaryDayStart && e.start <= diaryDayEnd) || (e.end >= diaryDayStart && e.end <= diaryDayEnd) || (e.start <= diaryDayStart && e.end >= diaryDayEnd)
  );
  const tasksOnDay =
    tab === "diary"
      ? tasks
      : tasks.filter(
          (t: TaskItem) =>
            t.dueDate != null && t.dueDate !== "" && isSameDay(new Date(t.dueDate), new Date(diaryDate))
        );

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

  const handleNaverDisconnect = useCallback(async () => {
    const res = await fetch("/api/integrations/naver-calendar", { method: "DELETE" });
    if (res.ok) {
      void mutateNaver({ connected: false, configured: true }, { revalidate: false });
      toast.success("네이버 캘린더 연동을 해제했습니다.");
    }
  }, [mutateNaver]);

  const handleNaverConnect = useCallback(() => {
    window.location.href = "/api/integrations/naver-calendar/auth";
  }, []);

  const handleNaverCalDavConnect = useCallback(async () => {
    if (!naverIdInput.trim() || !naverPasswordInput) {
      toast.error("네이버 아이디와 비밀번호를 입력하세요.");
      return;
    }
    setNaverConnecting(true);
    try {
      const res = await fetch(SWR_KEYS.naverCalDav, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naverId: naverIdInput.trim(), password: naverPasswordInput }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "네이버 캘린더 연결에 실패했습니다.");
      setNaverPasswordInput("");
      await mutateNaverCalDav();
      refreshExternalCalendars();
      toast.success("네이버 캘린더를 불러오도록 연결했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "네이버 캘린더 연결에 실패했습니다.");
    } finally {
      setNaverConnecting(false);
    }
  }, [naverIdInput, naverPasswordInput, mutateNaverCalDav, refreshExternalCalendars]);

  const handleNaverCalDavDisconnect = useCallback(async () => {
    const res = await fetch(SWR_KEYS.naverCalDav, { method: "DELETE" });
    if (!res.ok) {
      toast.error("연결 해제에 실패했습니다.");
      return;
    }
    await mutateNaverCalDav();
    setNaverEvents([]);
    refreshExternalCalendars();
    toast.success("네이버 캘린더 불러오기를 해제했습니다.");
  }, [mutateNaverCalDav, refreshExternalCalendars]);

  const handleNaverIcsUpload = useCallback(
    async (file: File) => {
      setNaverIcsUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/integrations/naver-calendar/import", {
          method: "POST",
          body: form,
        });
        const data = (await res.json().catch(() => ({}))) as { imported?: number; error?: string };
        if (!res.ok) throw new Error(data.error ?? ".ics 파일을 읽지 못했습니다.");
        await mutateNaverCalDav();
        refreshExternalCalendars();
        toast.success(`${data.imported ?? 0}건의 일정을 불러왔습니다.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : ".ics 파일을 읽지 못했습니다.");
      } finally {
        setNaverIcsUploading(false);
        if (naverIcsInputRef.current) naverIcsInputRef.current.value = "";
      }
    },
    [mutateNaverCalDav, refreshExternalCalendars]
  );

  const handleNaverIcsClear = useCallback(async () => {
    const res = await fetch("/api/integrations/naver-calendar/import", { method: "DELETE" });
    if (!res.ok) {
      toast.error("삭제에 실패했습니다.");
      return;
    }
    await mutateNaverCalDav();
    refreshExternalCalendars();
    toast.success("업로드한 네이버 일정을 삭제했습니다.");
  }, [mutateNaverCalDav, refreshExternalCalendars]);

  const loadIcalFeedUrls = useCallback(async () => {
    setIcalLoading(true);
    try {
      const res = await fetch(SWR_KEYS.calendarIcal);
      const data = (await res.json().catch(() => ({}))) as { feedUrl?: string; webcalUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "구독 URL을 불러오지 못했습니다.");
      setIcalFeedUrl(data.feedUrl ?? "");
      setIcalWebcalUrl(data.webcalUrl ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "구독 URL을 불러오지 못했습니다.");
    } finally {
      setIcalLoading(false);
    }
  }, []);

  const handleOpenIntegrations = useCallback(() => {
    setIntegrationsOpen(true);
    void loadIcalFeedUrls();
  }, [loadIcalFeedUrls]);

  const anyIntegrationConnected =
    googleConnected || naverConnected || naverHasReadSource;

  const handleManualSync = useCallback(() => {
    refreshExternalCalendars();
    void mutateNaverCalDav();
    toast.success("외부 캘린더를 다시 불러옵니다.");
  }, [refreshExternalCalendars, mutateNaverCalDav]);

  const handleCopyIcalUrl = useCallback(async () => {
    if (!icalFeedUrl) return;
    try {
      await navigator.clipboard.writeText(icalFeedUrl);
      toast.success("구독 URL을 복사했습니다.");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  }, [icalFeedUrl]);

  const handleRegenerateIcalUrl = useCallback(async () => {
    setIcalRegenerating(true);
    try {
      const res = await fetch(SWR_KEYS.calendarIcal, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate" }),
      });
      const data = (await res.json().catch(() => ({}))) as { feedUrl?: string; webcalUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "URL 재발급 실패");
      setIcalFeedUrl(data.feedUrl ?? "");
      setIcalWebcalUrl(data.webcalUrl ?? "");
      toast.success("새 구독 URL을 발급했습니다. 네이버 캘린더에서 다시 등록해 주세요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "URL 재발급 실패");
    } finally {
      setIcalRegenerating(false);
    }
  }, []);

  if (schedulesLoading && tab === "schedule") {
    return (
      <div className="schedule-gcal-root flex min-h-[60vh] flex-col">
        <ScheduleHeader
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
          anyIntegrationConnected={anyIntegrationConnected}
          onOpenIntegrations={handleOpenIntegrations}
          onNewSchedule={() => setCreateOpen(true)}
          visibleCalendars={visibleCalendars}
          onToggleCalendarLayer={setVisibleCalendar}
          completedProjectDisplay={completedProjectDisplay}
          onCompletedProjectDisplayChange={applyCompletedProjectDisplay}
        />
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-muted-foreground">일정을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="schedule-gcal-root flex flex-col">
      <ScheduleHeader
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
        anyIntegrationConnected={anyIntegrationConnected}
        onOpenIntegrations={handleOpenIntegrations}
        onNewSchedule={() => setCreateOpen(true)}
        visibleCalendars={visibleCalendars}
        onToggleCalendarLayer={setVisibleCalendar}
        completedProjectDisplay={completedProjectDisplay}
        onCompletedProjectDisplayChange={applyCompletedProjectDisplay}
      />

      <div className="flex flex-col gap-4 px-4 pb-6 pt-3 md:px-5">
        <div className="space-y-1">
          <PageHeadline
            title="스케줄"
            description="여기에는 직접 만든 할일과 출처 미정 데이터만 목록에 보입니다. Google·네이버 일정은 「캘린더 연동」에서 설정하면 캘린더에 함께 겹쳐 보입니다."
          />
          {session?.user?.role &&
            ["TEAM_LEAD", "EXECUTIVE", "ADMIN"].includes(session.user.role) && (
              <p className="text-muted-foreground max-w-xl text-sm">
                팀 휴가·연차 승인은{" "}
                <Link href="/leave" prefetch={false} className="font-medium text-foreground underline underline-offset-4 hover:no-underline">
                  연차/근태
                </Link>
                에서 하고, 신청 알림은{" "}
                <Link href="/notifications" prefetch={false} className="underline underline-offset-4 hover:no-underline">
                  알림함
                </Link>
                에도 쌓입니다.
              </p>
            )}
        </div>

      {tab === "schedule" && (
        <>
          <Card className="border-l-4 border-l-emerald-600 shadow-sm dark:border-l-emerald-500">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListTodo className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                  할일 목록
                </CardTitle>
                <p className="text-muted-foreground mt-1 text-sm font-normal">
                  직접 만든 할일만 나옵니다. 완료한 항목은 빠집니다.
                </p>
                <details className="group mt-1">
                  <summary className="text-muted-foreground cursor-pointer text-xs underline underline-offset-4 hover:no-underline">
                    무엇이 빠지나요?
                  </summary>
                  <ul className="text-muted-foreground mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed">
                    <li>
                      프로젝트·마인드맵에서 만든 업무는 여기 대신 캘린더의 「할일 마감」에 표시됩니다.
                    </li>
                    <li>아래 보라색 구역은 마감일이 없는 브랜드 프로젝트입니다.</li>
                  </ul>
                </details>
              </div>
              <Button size="sm" className="shrink-0 bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600" onClick={() => setCreateTaskOpen(true)}>
                <Plus className="mr-1.5 size-4" />
                할일 추가
              </Button>
            </CardHeader>
            <CardContent>
              <ScheduleTaskList
                tasks={tasks}
                onCompleted={handleScheduleTaskCompleted}
                listClassName="max-h-[min(40vh,320px)] overflow-y-auto pr-1"
                emptyHint={
                  <p className="text-muted-foreground py-4 text-center text-sm">
                    표시할 할일이 없습니다. 위 <span className="font-medium text-foreground">「할일 추가」</span>로 등록하거나{" "}
                    <Link href="/tasks" prefetch={false} className="font-medium text-primary underline underline-offset-4 hover:no-underline">
                      프로젝트 페이지
                    </Link>
                    로 이동하세요.
                  </p>
                }
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-900/10 pt-3 dark:border-emerald-900/30">
                <p className="text-muted-foreground text-xs">
                  프로젝트에 연결된 업무·완료 목록은 할일 페이지에서 확인하세요.
                </p>
                <Link href="/tasks" prefetch={false} className="text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300">
                  할일 페이지로 →
                </Link>
              </div>
            </CardContent>
          </Card>

          {narrowViewport && view === "month" && !mobileWeekBannerDismissed && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-50">
              <p className="min-w-0 flex-1">모바일에서는 주간 뷰가 더 편합니다. 전환하시겠습니까?</p>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8"
                  onClick={() => {
                    setView("week");
                    setMobileWeekBannerDismissed(true);
                  }}
                >
                  주간으로
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setMobileWeekBannerDismissed(true)}>
                  닫기
                </Button>
              </div>
            </div>
          )}

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

          {noDeadlineProjects.length > 0 && (
            <Card className="border-l-4 border-l-violet-600 shadow-sm dark:border-l-violet-500">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-violet-950 dark:text-violet-100">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-violet-100 text-xs font-bold text-violet-800 dark:bg-violet-900/60 dark:text-violet-100">
                    PJ
                  </span>
                  브랜드 프로젝트 · 마감일 없음
                </CardTitle>
                <p className="text-muted-foreground text-sm font-normal">
                  견적과 연결된 <strong className="text-foreground">브랜드 프로젝트</strong> 중 캘린더 마감이 비어 있는 항목입니다. 위 초록색 카드의 &quot;할일&quot;과는 다른 종류입니다.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                  {noDeadlineProjects.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/projects/${p.id}`}
                        prefetch={false}
                        className="flex items-center gap-2 rounded-md border border-violet-200/80 bg-violet-50/60 px-3 py-2 text-sm text-violet-950 hover:bg-violet-100/80 dark:border-violet-800/50 dark:bg-violet-950/30 dark:text-violet-50 dark:hover:bg-violet-950/50"
                      >
                        <span className="size-2 shrink-0 rounded-full bg-violet-500" aria-hidden />
                        <span className="min-w-0 truncate">
                          <span className="text-muted-foreground text-xs">{p.brand.name}</span>
                          {" · "}
                          <span className="font-medium">{p.name}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div
            className={cn(
              "schedule-gcal-viewport w-full",
              view === "month"
                ? "schedule-gcal-viewport--month h-auto"
                : "min-h-[520px] h-[min(70vh,900px)]"
            )}
          >
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
              popup
              doShowMoreDrillDown={false}
              components={calendarRbcComponents as any}
              dayPropGetter={(d: any) => {
                const ymd = toKstYmd(d as Date);
                const legal =
                  isLegalHoliday(d) ||
                  (visibleCalendars.holiday !== false && Boolean(holidayByYmd[ymd]));
                const dow = getDay(d as Date);
                const sat = dow === 6;
                const sun = dow === 0;
                const isToday = isSameDay(d as Date, new Date());
                const cls = cn(
                  legal ? "rbc-day--legal-holiday" : sat ? "rbc-day--saturday" : sun ? "rbc-day--sunday" : "",
                  isToday && "schedule-gcal-day-today"
                );
                return cls ? { className: cls } : {};
              }}
              eventPropGetter={(ev) => {
                const e = ev as ScheduleEvent;
                if (!shouldDimTaskDueWrapper(e, completedProjectDisplay)) return {};
                return { className: "rbc-event--completed-project" };
              }}
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
                showMore: (count: number) => `+${count}개 더보기`,
              }}
            />
          </div>
        </>
      )}

      {tab === "tasks" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">할일 목록</CardTitle>
              <p className="text-muted-foreground text-sm font-normal">
                할일·스케줄에서 직접 만든 항목과 기존(UNKNOWN) 데이터만 표시합니다. 마인드맵·프로젝트·메모 출처 업무는 제외되며, 완료된 항목은
                나오지 않습니다. 브랜드 프로젝트는 일정 탭 보라색 구역에서 안내합니다.
              </p>
            </div>
            <Button size="sm" onClick={() => setCreateTaskOpen(true)}>
              <Plus className="mr-1.5 size-4" />
              내 할일 추가
            </Button>
          </CardHeader>
          <CardContent>
              <ScheduleTaskList
                tasks={tasks}
                onCompleted={handleScheduleTaskCompleted}
                detailLabel="보기"
                emptyHint={
                  <p className="text-muted-foreground py-6 text-center text-sm">할일이 없습니다. 위 &#39;내 할일 추가&#39;로 등록하세요.</p>
                }
              />
            <Link href="/tasks" prefetch={false} className="text-primary mt-3 inline-block text-sm font-medium hover:underline">
              할일 전체 보기·완료 처리 →
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

      <Dialog
        open={leaveDetailId != null}
        onOpenChange={(open) => {
          if (!open) setLeaveDetailId(null);
        }}
      >
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>휴가 정보</DialogTitle>
          </DialogHeader>
          {leaveDetail ? (
            <div className="space-y-3 text-sm">
              <div className="grid gap-1">
                <p className="text-muted-foreground text-xs">신청자</p>
                <p className="font-medium">{formatUserName(leaveDetail.user)}</p>
              </div>
              <div className="grid gap-1">
                <p className="text-muted-foreground text-xs">유형</p>
                <p className="font-medium">{calendarLeaveTypeLabel(leaveDetail.type)}</p>
              </div>
              <div className="grid gap-1">
                <p className="text-muted-foreground text-xs">기간 (한국 달력 기준)</p>
                <p className="font-medium tabular-nums">
                  {formatKstYmdLongKo(toKstYmd(leaveDetail.startDate))} ~{" "}
                  {formatKstYmdLongKo(toKstYmd(leaveDetail.endDate))}
                </p>
              </div>
              <div className="grid gap-1">
                <p className="text-muted-foreground text-xs">상태</p>
                <p className="font-medium">{scheduleLeaveStatusLabel(leaveDetail.status)}</p>
              </div>
              {(leaveDetail.reason ?? "").trim() ? (
                <div className="grid gap-1">
                  <p className="text-muted-foreground text-xs">사유</p>
                  <p className="whitespace-pre-wrap break-words rounded border bg-muted/30 p-2 text-xs leading-relaxed">
                    {(leaveDetail.reason ?? "").trim()}
                  </p>
                </div>
              ) : null}
              <p className="text-muted-foreground font-mono text-[11px]">ID: {leaveDetail.id}</p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">해당 휴가를 목록에서 찾을 수 없습니다. 연차/근태에서 확인해 주세요.</p>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setLeaveDetailId(null)}>
              닫기
            </Button>
            <Button type="button" asChild className="sm:ml-0">
              <Link href="/leave" prefetch={false} onClick={() => setLeaveDetailId(null)}>
                연차/근태로 이동
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={integrationsOpen} onOpenChange={setIntegrationsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>캘린더 연동</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="naver">
            <TabsList className="w-full">
              <TabsTrigger value="naver" className="flex-1">
                네이버
              </TabsTrigger>
              <TabsTrigger value="google" className="flex-1">
                Google
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="naver"
              className="max-h-[58vh] space-y-4 overflow-y-auto pr-1 text-sm"
            >
              <section className="space-y-3">
                <div>
                  <h3 className="font-semibold">네이버 일정 가져오기</h3>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    네이버는 변경 알림을 보내주지 않아 CRM이 2분마다 다시 확인합니다. 아래 두 방법 중
                    하나만 설정하면 됩니다.
                  </p>
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold">방법 1. 계정 연결 (자동)</p>
                  {naverReadConnected ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-muted-foreground text-xs">
                        <span className="text-foreground font-medium">
                          {naverCalDavStatus?.naverId}
                        </span>{" "}
                        계정으로 연결되어 있습니다.
                      </p>
                      {naverCalDavStatus?.lastSyncedAt ? (
                        <p className="text-muted-foreground text-xs">
                          마지막 확인{" "}
                          {format(new Date(naverCalDavStatus.lastSyncedAt), "M월 d일 HH:mm", {
                            locale: ko,
                          })}
                        </p>
                      ) : null}
                      {naverCalDavStatus?.lastError ? (
                        <p className="text-xs text-red-600">{naverCalDavStatus.lastError}</p>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleNaverCalDavDisconnect()}
                      >
                        연결 해제
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        2단계 인증을 쓰면 네이버에서 「애플리케이션 비밀번호」를 발급받아 입력하세요.
                        비밀번호는 암호화해서 보관하며 일정을 읽는 데만 사용합니다.
                      </p>
                      <Input
                        placeholder="네이버 아이디"
                        autoComplete="off"
                        value={naverIdInput}
                        onChange={(e) => setNaverIdInput(e.target.value)}
                      />
                      <Input
                        type="password"
                        placeholder="비밀번호 또는 애플리케이션 비밀번호"
                        autoComplete="new-password"
                        value={naverPasswordInput}
                        onChange={(e) => setNaverPasswordInput(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={naverConnecting || !naverReadConfigured}
                        onClick={() => void handleNaverCalDavConnect()}
                      >
                        {naverConnecting ? "연결 중..." : "연결"}
                      </Button>
                      {!naverReadConfigured ? (
                        <p className="text-xs text-red-600">
                          서버에 암호화 키(CALENDAR_CREDENTIAL_KEY 또는 AUTH_SECRET)가 없어 연결할 수
                          없습니다.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold">방법 2. 파일 올리기 (수동)</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    네이버 캘린더의 「가져오기/내보내기(백업)」에서 받은 .ics 파일을 올리면 그 시점 일정이
                    표시됩니다. 다시 올리면 이전 업로드분을 대체합니다.
                  </p>
                  <input
                    ref={naverIcsInputRef}
                    type="file"
                    accept=".ics,text/calendar"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleNaverIcsUpload(file);
                    }}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={naverIcsUploading}
                      onClick={() => naverIcsInputRef.current?.click()}
                    >
                      <Upload className="mr-1.5 size-4" />
                      {naverIcsUploading ? "불러오는 중..." : ".ics 파일 선택"}
                    </Button>
                    {naverImportedCount > 0 ? (
                      <>
                        <span className="text-muted-foreground text-xs">
                          {naverImportedCount}건 표시 중
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleNaverIcsClear()}
                        >
                          <Trash2 className="mr-1.5 size-4" />
                          삭제
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="space-y-3 border-t pt-4">
                <div>
                  <h3 className="font-semibold">CRM 일정 네이버로 보내기</h3>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    반대 방향입니다. 필요 없으면 설정하지 않아도 됩니다.
                  </p>
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold">자동 등록</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    연동하면 새로 만든 CRM 일정과 승인된 휴가가 네이버 캘린더에 등록됩니다.
                  </p>
                  <div className="mt-2">
                    {!naverConfigured ? (
                      <p className="text-muted-foreground text-xs">
                        서버에 네이버 OAuth 설정이 없어 사용할 수 없습니다.
                      </p>
                    ) : naverConnected ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleNaverDisconnect()}
                      >
                        연동 해제
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={handleNaverConnect}>
                        네이버 로그인으로 연동
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-xs font-semibold">네이버에서 구독할 주소</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    아래 주소를 네이버 캘린더의 「가져오기 → 외부 URL」에 넣으면 CRM 일정과 승인된 휴가를
                    네이버에서 볼 수 있습니다. 비밀 링크이므로 외부에 공유하지 마세요.
                  </p>
                  {icalLoading ? (
                    <p className="text-muted-foreground py-3 text-center text-xs">
                      주소 불러오는 중...
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <Input readOnly value={icalFeedUrl} className="font-mono text-xs" />
                      {icalWebcalUrl ? (
                        <Input readOnly value={icalWebcalUrl} className="font-mono text-xs" />
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!icalFeedUrl}
                          onClick={() => void handleCopyIcalUrl()}
                        >
                          <Copy className="mr-1.5 size-4" />
                          주소 복사
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={icalRegenerating || icalLoading}
                          onClick={() => void handleRegenerateIcalUrl()}
                        >
                          <RefreshCw className="mr-1.5 size-4" />
                          재발급
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="google" className="space-y-3 text-sm">
              <div>
                <h3 className="font-semibold">Google 캘린더 가져오기</h3>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  연동하면 Google 일정이 캘린더에 함께 표시되고 2분마다 갱신됩니다. CRM 일정이 Google로
                  넘어가지는 않습니다.
                </p>
              </div>
              <div className="rounded-lg border p-3">
                {googleConnected ? (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs">연동되어 있습니다.</p>
                    {gcalStatus?.needsTasksReauth ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
                        <p className="font-medium">구글 할일을 CRM에 가져오려면 재연결이 필요합니다.</p>
                        <p className="mt-1 text-amber-800">
                          기존 캘린더 가져오기는 그대로입니다. 한 번만 다시 동의해 주세요.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          className="mt-2"
                          onClick={handleGoogleConnect}
                        >
                          재연결 (할일 권한)
                        </Button>
                      </div>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleGoogleDisconnect()}
                    >
                      연동 해제
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={handleGoogleConnect}>
                    Google 계정으로 연동
                  </Button>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={!anyIntegrationConnected}
              onClick={handleManualSync}
            >
              <RefreshCw className="mr-1.5 size-4" />
              지금 새로고침
            </Button>
            <Button type="button" variant="outline" onClick={() => setIntegrationsOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={null}>
      <SchedulePageInner />
    </Suspense>
  );
}
