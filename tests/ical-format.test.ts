import { describe, expect, it } from "vitest";
import { buildIcalStringForNaver, buildVevent, formatIcalDateKst } from "@/lib/ical-format";

describe("ical-format", () => {
  it("builds all-day vevent with exclusive end date", () => {
    const start = new Date("2026-08-10T00:00:00+09:00");
    const end = new Date("2026-08-10T23:59:59+09:00");
    const vevent = buildVevent({
      uid: "test@cpcrm",
      summary: "연차",
      start,
      end,
      isAllDay: true,
    });
    expect(vevent).toContain("DTSTART;VALUE=DATE:20260810");
    expect(vevent).toContain("DTEND;VALUE=DATE:20260811");
  });

  it("wraps vevent in vcalendar for naver", () => {
    const start = new Date("2026-08-10T09:00:00+09:00");
    const end = new Date("2026-08-10T10:00:00+09:00");
    const ical = buildIcalStringForNaver({
      uid: "crm-schedule-1@cpcrm",
      summary: "[팀] 회의",
      start,
      end,
    });
    expect(ical).toContain("BEGIN:VCALENDAR");
    expect(ical).toContain("BEGIN:VEVENT");
    expect(ical).toContain("SUMMARY:[팀] 회의");
    expect(formatIcalDateKst(start)).toMatch(/^20260810$/);
  });
});
