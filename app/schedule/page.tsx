"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  jsonFetcher,
  SWR_KEYS,
  schedulePersonalKey,
  scheduleTeamKey,
  schedulesWorkspaceFetcher,
} from "@/lib/api-swr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, startOfDay, endOfDay, isSameDay, startOfMonth, endOfMonth, endOfWeek, addDays, isBefore, isAfter } from "date-fns";
import { ko } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { ScheduleDetailModal } from "@/components/schedule-detail-modal";
import { CreateScheduleModal } from "@/components/create-schedule-modal";
import { CreateTaskModal } from "@/components/create-task-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, CalendarClock, ListTodo, FileText, CalendarDays, Calendar as CalendarIcon, Layers } from "lucide-react";
import { formatUserName } from "@/lib/utils";
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

export type CalendarLayerId = "personal" | "team" | "holiday" | "google" | "taskDue";

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
  const isSat = getDay(date) === 6;
  const legal = isLegalHoliday(date);
  const className = legal ? "rbc-date-cell--legal-holiday" : isSat ? "rbc-date-cell--saturday" : "";
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

const NAVIGATE_DATE = "DATE" as const;

type ScheduleToolbarProps = {
  label: string;
  date: Date;
  view: string;
  views: string[];
  onNavigate: (action: string, date?: Date) => void;
  onView: (view: string) => void;
  localizer: { messages: Record<string, string> };
};

function ScheduleToolbar({ label, date, view, views, onNavigate, onView, localizer }: ScheduleToolbarProps) {
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
      onNavigate(NAVIGATE_DATE, new Date(year, month, 1));
      setPickerOpen(false);
    },
    [onNavigate]
  );

  return (
    <div className="rbc-toolbar flex flex-wrap items-center gap-2">
      <span className="rbc-btn-group flex gap-1">
        <button
          type="button"
          className="rounded border border-input bg-background px-2 py-1.5 text-sm hover:bg-muted"
          onClick={() => onNavigate("TODAY")}
        >
          {localizer.messages.today}
        </button>
        <button
          type="button"
          className="rounded border border-input bg-background px-2 py-1.5 text-sm hover:bg-muted"
          onClick={() => onNavigate("PREV")}
        >
          {localizer.messages.previous}
        </button>
        <button
          type="button"
          className="rounded border border-input bg-background px-2 py-1.5 text-sm hover:bg-muted"
          onClick={() => onNavigate("NEXT")}
        >
          {localizer.messages.next}
        </button>
      </span>

      <div className="relative flex-1 flex justify-center">
        <button
          type="button"
          className="rbc-toolbar-label rounded px-3 py-1.5 text-center font-medium hover:bg-muted min-w-[140px]"
          onClick={() => setPickerOpen((o: any) => !o)}
          aria-expanded={pickerOpen}
          aria-haspopup="listbox"
        >
          {label}
        </button>
        {pickerOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              aria-hidden
              onClick={() => setPickerOpen(false)}
            />
            <div
              ref={listRef}
              role="listbox"
              className="absolute left-1/2 top-full z-50 mt-1 max-h-[280px] w-56 -translate-x-1/2 overflow-y-auto rounded-md border bg-card py-1 shadow-lg"
            >
              {monthOptions.map((opt, idx) => (
                <button
                  key={`${opt.year}-${opt.month}`}
                  type="button"
                  data-index={idx}
                  role="option"
                  aria-selected={opt.year === currentYear && opt.month === currentMonth}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${opt.year === currentYear && opt.month === currentMonth ? "bg-muted font-medium" : ""}`}
                  onClick={() => handleSelectMonth(opt.year, opt.month)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {views.length > 1 && (
        <span className="rbc-btn-group flex gap-1">
          {views.map((v: any) => (
            <button
              type="button"
              key={v}
              className={`rounded border px-2 py-1.5 text-sm ${view === v ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:bg-muted"}`}
              onClick={() => onView(v)}
            >
              {localizer.messages[v] ?? v}
            </button>
          ))}
        </span>
      )}
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

type LeaveRequestItem = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  user: { name: string; position?: string | null };
};

type TabId = "schedule" | "tasks" | "diary";

const CALENDAR_LAYER_LABELS: Record<CalendarLayerId, string> = {
  personal: "내 일정",
  team: "팀/회사 일정",
  holiday: "공휴일",
  google: "Google 캘린더",
  taskDue: "프로젝트 마감",
};

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
  const [visibleCalendars, setVisibleCalendars] = useState<Record<CalendarLayerId, boolean>>(
    () => (typeof window !== "undefined" ? loadVisibleCalendars() : DEFAULT_VISIBLE_CALENDARS)
  );
  const { data: session } = useSession();
  const router = useRouter();

  const { data: personalRaw = [], mutate: mutatePersonalSched, isLoading: personalSchedLoading } = useSWR(
    session?.user ? schedulePersonalKey : null,
    schedulesWorkspaceFetcher,
    { dedupingInterval: 8000, revalidateOnFocus: true }
  );
  const { data: teamRaw = [], mutate: mutateTeamSched, isLoading: teamSchedLoading } = useSWR(
    session?.user ? scheduleTeamKey : null,
    schedulesWorkspaceFetcher,
    { dedupingInterval: 8000, revalidateOnFocus: true }
  );

  const personalEvents = useMemo(
    () => (personalRaw as Parameters<typeof toEvent>[0][]).map((s) => toEvent(s, "personal")),
    [personalRaw]
  );
  const teamEvents = useMemo(
    () => (teamRaw as Parameters<typeof toEvent>[0][]).map((s) => toEvent(s, "team")),
    [teamRaw]
  );

  const calendarRange = useMemo(() => {
    const rangeStart = view === "month" ? startOfMonth(date) : startOfWeek(date, { weekStartsOn: 1 });
    const rangeEnd = view === "month" ? endOfMonth(date) : endOfWeek(date, { weekStartsOn: 1 });
    return { rangeStart, rangeEnd };
  }, [view, date]);

  const calendarDueKey =
    session?.user && tab === "schedule"
      ? `/api/tasks?calendarDue=1&dueAfter=${encodeURIComponent(calendarRange.rangeStart.toISOString())}&dueBefore=${encodeURIComponent(calendarRange.rangeEnd.toISOString())}`
      : null;
  const { data: calendarDueRaw = [] } = useSWR(
    calendarDueKey,
    jsonFetcher,
    { dedupingInterval: 12_000, revalidateOnFocus: true }
  );
  const taskDueEvents = useMemo(
    () =>
      tasksToCalendarDueEvents(
        (calendarDueRaw as { id: string; title: string; dueDate: string; isCompleted: boolean }[]) ?? [],
        new Date()
      ),
    [calendarDueRaw]
  );

  const schedulesLoading = Boolean(session?.user) && (personalSchedLoading || teamSchedLoading);

  const { data: tasksRaw, mutate: mutateTasks } = useSWR(
    session?.user ? SWR_KEYS.tasksAll : null,
    jsonFetcher,
    { dedupingInterval: 10_000, revalidateOnFocus: true }
  );
  const tasks = useMemo((): TaskItem[] => {
    if (tasksRaw == null) return [];
    const raw = tasksRaw as unknown[] | { items?: unknown[] };
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
  }, [tasksRaw]);

  const { data: invites = [], mutate: mutateInvites } = useSWR<ScheduleInvite[]>(
    session?.user ? SWR_KEYS.scheduleInvites : null,
    jsonFetcher,
    { dedupingInterval: 12_000, revalidateOnFocus: true }
  );

  const { data: leaveData, mutate: mutateLeave } = useSWR<LeaveApiResponse>(
    session?.user ? SWR_KEYS.leave : null,
    jsonFetcher,
    { dedupingInterval: 20_000, revalidateOnFocus: true }
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
    session?.user ? SWR_KEYS.googleCalendar : null,
    jsonFetcher,
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );
  const googleConnected = gcalStatus?.connected ?? false;

  const revalidateSchedules = useCallback(() => {
    void mutatePersonalSched();
    void mutateTeamSched();
  }, [mutatePersonalSched, mutateTeamSched]);

  useEffect(() => {
    const onWorkspaceChange = () => revalidateSchedules();
    window.addEventListener("workspace-changed", onWorkspaceChange);
    return () => window.removeEventListener("workspace-changed", onWorkspaceChange);
  }, [revalidateSchedules]);

  useEffect(() => {
    if (!googleConnected || tab !== "schedule") {
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
  }, [googleConnected, tab, view, date]);

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
  const tasksOnDay = tasks.filter((t: any) => {
    const d = new Date(t.dueDate);
    return isSameDay(d, new Date(diaryDate));
  });

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "schedule", label: "일정", icon: <CalendarDays className="size-4" /> },
    { id: "tasks", label: "할일", icon: <ListTodo className="size-4" /> },
    { id: "diary", label: "Daily Report", icon: <FileText className="size-4" /> },
  ];

  if (schedulesLoading && tab === "schedule") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">일정을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeadline
          title="스케줄"
          description="일정과 할일을 구분해 보고, Daily Report로 자동 정리할 수 있습니다."
        />
        {tab === "schedule" && (
          <div className="flex flex-wrap items-center gap-2">
            {googleConnected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const res = await fetch("/api/integrations/google-calendar", { method: "DELETE" });
                  if (res.ok) {
                    setGoogleEvents([]);
                    void mutateGcal({ connected: false }, { revalidate: false });
                    toast.success("Google 캘린더 연동을 해제했습니다.");
                  }
                }}
              >
                <CalendarIcon className="mr-1.5 size-4" />
                Google 연동됨 (해제)
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = "/api/integrations/google-calendar/auth";
                }}
              >
                <CalendarIcon className="mr-1.5 size-4" />
                Google 캘린더 연동
              </Button>
            )}
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              새 일정
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map(({ id, label, icon }) => (
          <Button
            key={id}
            variant={tab === id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTab(id)}
            className="gap-1.5"
          >
            {icon}
            {label}
          </Button>
        ))}
      </div>

      {tab === "schedule" && (
        <>
          <Card className="border-border shrink-0">
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Layers className="size-4" />
                캘린더 표시 (워크스페이스)
              </CardTitle>
              <p className="text-muted-foreground text-xs font-normal">
                보고 싶은 일정만 체크해서 표시하거나 숨기세요.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-6 gap-y-2 pt-0">
              {(["personal", "team", "holiday", "google", "taskDue"] as CalendarLayerId[]).map((layer: CalendarLayerId) => (
                <label
                  key={layer}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={(visibleCalendars as Record<CalendarLayerId, boolean>)[layer] !== false}
                    onCheckedChange={(checked: unknown) => setVisibleCalendar(layer, checked === true)}
                  />
                  <span
                    className="rbc-calendar-layer-dot"
                    style={{
                      backgroundColor:
                        layer === "personal"
                          ? "var(--rbc-personal, #3b82f6)"
                          : layer === "team"
                            ? "var(--rbc-team, #22c55e)"
                            : layer === "holiday"
                              ? "var(--rbc-holiday, #eab308)"
                              : layer === "taskDue"
                                ? "var(--rbc-task-due, #ea580c)"
                                : "var(--rbc-google, #ec4899)",
                    }}
                  />
                  {CALENDAR_LAYER_LABELS[layer]}
                </label>
              ))}
            </CardContent>
          </Card>

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

          <div className="h-[600px] rounded-lg border bg-card">
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
              components={{
                dateHeader: CustomDateHeader as any,
                toolbar: ScheduleToolbar as any,
                dateCellWrapper: createDateCellWrapper(leaveByDate) as any,
              } as any}
              dayPropGetter={(d: any) => {
                const legal = isLegalHoliday(d);
                const sat = getDay(d) === 6;
                const cls = legal ? "rbc-day--legal-holiday" : sat ? "rbc-day--saturday" : "";
                return cls ? { className: cls } : {};
              }}
              eventPropGetter={(event: unknown) => {
                const e = event as ScheduleEvent;
                if (e.isTaskDue || (typeof e.id === "string" && e.id.startsWith("task-due-"))) {
                  return {
                    className:
                      e.taskDueOverdue && !e.taskDueCompleted
                        ? "rbc-event--task-due rbc-event--task-due-overdue"
                        : "rbc-event--task-due",
                  };
                }
                if (e.calendarId === "holiday" || (typeof e.id === "string" && e.id.startsWith("hol-"))) {
                  return { className: "rbc-event--holiday" };
                }
                if (e.calendarId === "google" || (typeof e.id === "string" && e.id.startsWith("google-"))) {
                  return { className: "rbc-event--google" };
                }
                if (e.calendarId === "personal") return { className: "rbc-event--personal" };
                if (e.calendarId === "team") return { className: "rbc-event--team" };
                return {};
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
            <Link href="/tasks" className="text-primary mt-3 inline-block text-sm font-medium hover:underline">
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
          setCreateTaskOpen(false);
        }}
        defaultAssignedToId={session?.user?.id ?? null}
      />
    </div>
  );
}
