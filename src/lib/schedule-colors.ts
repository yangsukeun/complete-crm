/**
 * 스케줄(캘린더) 레이어별 색상 — UI 칩·이벤트 블록에 공통 사용.
 *
 * 변경 위치: 이 파일의 `EVENT_PALETTE`만 수정하면 `app/schedule/page.tsx`의
 * `CALENDAR_CHIP_COLORS`·`paletteForEvent`·`ScheduleCalendarEvent`에 반영됩니다.
 * (캘린더 CSS: `app/schedule/schedule-calendar.css`)
 */
export type CalendarLayerId = "personal" | "team" | "holiday" | "google" | "taskDue";

export const EVENT_PALETTE: Record<CalendarLayerId, { bg: string; light: string; text: string }> = {
  personal: { bg: "#1a73e8", light: "#e8f0fe", text: "#ffffff" },
  team: { bg: "#0f9d58", light: "#e6f4ea", text: "#ffffff" },
  holiday: { bg: "#f4511e", light: "#fce8e6", text: "#ffffff" },
  /** 월간: 연보라 배경 + 진보라 텍스트 (CRM 일정보다 톤다운, solid 보라 금지) */
  google: { bg: "#9575cd", light: "#f3eef9", text: "#5e35b1" },
  taskDue: { bg: "#e53935", light: "#fce8e6", text: "#ffffff" },
};
