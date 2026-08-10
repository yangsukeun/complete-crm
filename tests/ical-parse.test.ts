import { describe, expect, it } from "vitest";
import { parseIcalEvents } from "@/lib/ical-parse";

function wrap(body: string): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", body, "END:VCALENDAR"].join("\r\n");
}

const WINDOW = {
  windowStart: new Date("2026-08-01T00:00:00+09:00"),
  windowEnd: new Date("2026-09-30T23:59:59+09:00"),
};

describe("ical-parse", () => {
  it("parses a KST timed event via TZID", () => {
    const ics = wrap(
      [
        "BEGIN:VEVENT",
        "UID:evt-1@naver.com",
        "SUMMARY:주간 보고",
        "DTSTART;TZID=Asia/Seoul:20260810T090000",
        "DTEND;TZID=Asia/Seoul:20260810T100000",
        "END:VEVENT",
      ].join("\r\n")
    );
    const [event] = parseIcalEvents(ics, WINDOW);
    expect(event.uid).toBe("evt-1@naver.com");
    expect(event.summary).toBe("주간 보고");
    expect(event.isAllDay).toBe(false);
    expect(event.start.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(event.end.toISOString()).toBe("2026-08-10T01:00:00.000Z");
  });

  it("treats floating time as KST", () => {
    const ics = wrap(
      ["BEGIN:VEVENT", "UID:f-1", "DTSTART:20260812T140000", "DTEND:20260812T150000", "END:VEVENT"].join(
        "\r\n"
      )
    );
    const [event] = parseIcalEvents(ics, WINDOW);
    expect(event.start.toISOString()).toBe("2026-08-12T05:00:00.000Z");
  });

  it("parses UTC time as-is", () => {
    const ics = wrap(
      ["BEGIN:VEVENT", "UID:z-1", "DTSTART:20260812T050000Z", "DTEND:20260812T060000Z", "END:VEVENT"].join(
        "\r\n"
      )
    );
    const [event] = parseIcalEvents(ics, WINDOW);
    expect(event.start.toISOString()).toBe("2026-08-12T05:00:00.000Z");
  });

  it("converts exclusive all-day DTEND to inclusive end", () => {
    const ics = wrap(
      [
        "BEGIN:VEVENT",
        "UID:allday-1",
        "SUMMARY:여름 휴가",
        "DTSTART;VALUE=DATE:20260817",
        "DTEND;VALUE=DATE:20260820",
        "END:VEVENT",
      ].join("\r\n")
    );
    const [event] = parseIcalEvents(ics, WINDOW);
    expect(event.isAllDay).toBe(true);
    expect(event.start.toISOString()).toBe("2026-08-16T15:00:00.000Z");
    // 8/19 24:00 KST - 1ms → 마지막 날은 8/19
    expect(event.end.toISOString()).toBe("2026-08-19T14:59:59.999Z");
  });

  it("unfolds wrapped lines and unescapes text", () => {
    const ics = wrap(
      [
        "BEGIN:VEVENT",
        "UID:fold-1",
        "SUMMARY:아주 긴 제목 이어",
        " 지는 부분",
        "DESCRIPTION:첫줄\\n둘째줄\\, 쉼표",
        "DTSTART;TZID=Asia/Seoul:20260901T090000",
        "DTEND;TZID=Asia/Seoul:20260901T100000",
        "END:VEVENT",
      ].join("\r\n")
    );
    const [event] = parseIcalEvents(ics, WINDOW);
    expect(event.summary).toBe("아주 긴 제목 이어지는 부분");
    expect(event.description).toBe("첫줄\n둘째줄, 쉼표");
  });

  it("expands weekly recurrence with BYDAY inside the window", () => {
    const ics = wrap(
      [
        "BEGIN:VEVENT",
        "UID:weekly-1",
        "SUMMARY:스크럼",
        "DTSTART;TZID=Asia/Seoul:20260803T100000",
        "DTEND;TZID=Asia/Seoul:20260803T103000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260901T000000Z",
        "END:VEVENT",
      ].join("\r\n")
    );
    const events = parseIcalEvents(ics, WINDOW);
    // 8/3, 8/10, 8/17, 8/24, 8/31 (모두 월요일)
    expect(events).toHaveLength(5);
    expect(events.every((e) => e.summary === "스크럼")).toBe(true);
    expect(events[1].start.toISOString()).toBe("2026-08-10T01:00:00.000Z");
  });

  it("honours COUNT and EXDATE", () => {
    const ics = wrap(
      [
        "BEGIN:VEVENT",
        "UID:daily-1",
        "DTSTART;TZID=Asia/Seoul:20260805T080000",
        "DTEND;TZID=Asia/Seoul:20260805T083000",
        "RRULE:FREQ=DAILY;COUNT=4",
        "EXDATE;TZID=Asia/Seoul:20260806T080000",
        "END:VEVENT",
      ].join("\r\n")
    );
    const events = parseIcalEvents(ics, WINDOW);
    // 8/5, 8/6, 8/7, 8/8 중 8/6 제외
    expect(events.map((e) => e.start.toISOString())).toEqual([
      "2026-08-04T23:00:00.000Z",
      "2026-08-06T23:00:00.000Z",
      "2026-08-07T23:00:00.000Z",
    ]);
  });

  it("expands monthly recurrence on the same day of month", () => {
    const ics = wrap(
      [
        "BEGIN:VEVENT",
        "UID:monthly-1",
        "DTSTART;TZID=Asia/Seoul:20260815T130000",
        "DTEND;TZID=Asia/Seoul:20260815T140000",
        "RRULE:FREQ=MONTHLY",
        "END:VEVENT",
      ].join("\r\n")
    );
    const events = parseIcalEvents(ics, WINDOW);
    expect(events.map((e) => e.start.toISOString())).toEqual([
      "2026-08-15T04:00:00.000Z",
      "2026-09-15T04:00:00.000Z",
    ]);
  });

  it("drops events outside the requested window", () => {
    const ics = wrap(
      [
        "BEGIN:VEVENT",
        "UID:old-1",
        "DTSTART;TZID=Asia/Seoul:20250101T090000",
        "DTEND;TZID=Asia/Seoul:20250101T100000",
        "END:VEVENT",
      ].join("\r\n")
    );
    expect(parseIcalEvents(ics, WINDOW)).toHaveLength(0);
  });

  it("falls back to a one hour duration when DTEND is missing", () => {
    const ics = wrap(
      ["BEGIN:VEVENT", "UID:noend-1", "DTSTART;TZID=Asia/Seoul:20260810T090000", "END:VEVENT"].join(
        "\r\n"
      )
    );
    const [event] = parseIcalEvents(ics, WINDOW);
    expect(event.end.getTime() - event.start.getTime()).toBe(60 * 60 * 1000);
  });

  it("uses DURATION when provided", () => {
    const ics = wrap(
      [
        "BEGIN:VEVENT",
        "UID:dur-1",
        "DTSTART;TZID=Asia/Seoul:20260810T090000",
        "DURATION:PT2H30M",
        "END:VEVENT",
      ].join("\r\n")
    );
    const [event] = parseIcalEvents(ics, WINDOW);
    expect(event.end.getTime() - event.start.getTime()).toBe(150 * 60 * 1000);
  });
});
