/** iCalendar(VCALENDAR/VEVENT) 문자열 생성 — Naver Calendar API·구독 피드 공용 */

const KST = "Asia/Seoul";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function kstParts(d: Date): { y: number; m: number; day: number; h: number; min: number; s: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    y: get("year"),
    m: get("month"),
    day: get("day"),
    h: get("hour"),
    min: get("minute"),
    s: get("second"),
  };
}

export function formatIcalDateKst(d: Date): string {
  const { y, m, day } = kstParts(d);
  return `${y}${pad2(m)}${pad2(day)}`;
}

export function formatIcalDateTimeKst(d: Date): string {
  const { y, m, day, h, min, s } = kstParts(d);
  return `${y}${pad2(m)}${pad2(day)}T${pad2(h)}${pad2(min)}${pad2(s)}`;
}

export function formatIcalUtcStamp(d: Date = new Date()): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export type IcalEventInput = {
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  isAllDay?: boolean;
};

export function buildVevent(input: IcalEventInput): string {
  const lines: string[] = ["BEGIN:VEVENT", `UID:${input.uid}`];
  const stamp = formatIcalUtcStamp();

  if (input.isAllDay) {
    const startYmd = formatIcalDateKst(input.start);
    const endInclusive = input.end.getTime() >= input.start.getTime() ? input.end : input.start;
    const endYmd = formatIcalDateKst(new Date(endInclusive.getTime() + 24 * 60 * 60 * 1000));
    lines.push(`DTSTART;VALUE=DATE:${startYmd}`);
    lines.push(`DTEND;VALUE=DATE:${endYmd}`);
  } else {
    lines.push(`DTSTART:${formatIcalDateTimeKst(input.start)}`);
    lines.push(`DTEND:${formatIcalDateTimeKst(input.end)}`);
  }

  lines.push(`SUMMARY:${escapeIcalText(input.summary)}`);
  if (input.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcalText(input.description.trim())}`);
  }
  if (input.location?.trim()) {
    lines.push(`LOCATION:${escapeIcalText(input.location.trim())}`);
  }
  lines.push(`CREATED:${stamp}`);
  lines.push(`LAST-MODIFIED:${stamp}`);
  lines.push(`DTSTAMP:${stamp}`);
  lines.push("END:VEVENT");
  return lines.join("\n");
}

export function buildVcalendar(vevents: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//complete-crm//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...vevents,
    "END:VCALENDAR",
  ].join("\n");
}

export function buildIcalStringForNaver(event: IcalEventInput): string {
  return buildVcalendar([buildVevent(event)]);
}
