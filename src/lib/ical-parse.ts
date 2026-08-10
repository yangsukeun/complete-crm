/**
 * iCalendar(.ics) 파싱 — 네이버 CalDAV 응답·업로드 파일 공용.
 * 시간대 미지정(floating) 값은 KST로 해석합니다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 반복 일정 스캔 상한 (무한 RRULE 방어) */
const MAX_SCAN_DAYS = 4000;
const MAX_OCCURRENCES = 500;

export type ParsedIcalEvent = {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: Date;
  end: Date;
  isAllDay: boolean;
};

type PropLine = { name: string; params: Record<string, string>; value: string };

function unfoldLines(text: string): string[] {
  const rows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const row of rows) {
    if ((row.startsWith(" ") || row.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += row.slice(1);
    } else {
      out.push(row);
    }
  }
  return out;
}

function indexOfUnquoted(line: string, char: string, from = 0): number {
  let quoted = false;
  for (let i = from; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === char) return i;
  }
  return -1;
}

function splitUnquoted(head: string, char: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (;;) {
    const idx = indexOfUnquoted(head, char, start);
    if (idx < 0) {
      parts.push(head.slice(start));
      return parts;
    }
    parts.push(head.slice(start, idx));
    start = idx + 1;
  }
}

function parsePropLine(line: string): PropLine | null {
  const colon = indexOfUnquoted(line, ":");
  if (colon < 0) return null;
  const segments = splitUnquoted(line.slice(0, colon), ";");
  const name = (segments[0] ?? "").trim().toUpperCase();
  if (!name) return null;

  const params: Record<string, string> = {};
  for (let i = 1; i < segments.length; i++) {
    const eq = segments[i].indexOf("=");
    if (eq < 0) continue;
    const key = segments[i].slice(0, eq).trim().toUpperCase();
    const raw = segments[i].slice(eq + 1).trim();
    params[key] = raw.replace(/^"(.*)"$/, "$1");
  }
  return { name, params, value: line.slice(colon + 1) };
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** `YYYY-MM-DDTHH:mm:ss` 를 지정 IANA 시간대의 실제 시각(UTC Date)으로 변환 */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  // 해당 시각을 tz로 표기했을 때의 값과 원하는 값의 차이만큼 보정 (DST 포함 2회 반복이면 충분)
  let result = guess;
  for (let i = 0; i < 2; i++) {
    const asTz = tzFieldsOf(new Date(result), tz);
    const diff =
      Date.UTC(asTz.y, asTz.mo - 1, asTz.d, asTz.h, asTz.mi, asTz.s) - Date.UTC(y, mo - 1, d, h, mi, s);
    if (diff === 0) break;
    result -= diff;
  }
  return new Date(result);
}

function tzFieldsOf(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: pick("year"), mo: pick("month"), d: pick("day"), h: pick("hour"), mi: pick("minute"), s: pick("second") };
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type IcalDate = { date: Date; isDateOnly: boolean };

export function parseIcalDateValue(value: string, params: Record<string, string> = {}): IcalDate | null {
  const raw = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (dateOnly || params.VALUE === "DATE") {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(raw);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return { date: new Date(Date.UTC(y, mo - 1, d) - KST_OFFSET_MS), isDateOnly: true };
  }

  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(raw);
  if (!dt) return null;
  const [, ys, mos, ds, hs, mis, ss, zulu] = dt;
  const y = Number(ys);
  const mo = Number(mos);
  const d = Number(ds);
  const h = Number(hs);
  const mi = Number(mis);
  const s = Number(ss);

  if (zulu) {
    return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), isDateOnly: false };
  }

  const tzid = params.TZID;
  if (tzid && isValidTimeZone(tzid)) {
    return { date: zonedToUtc(y, mo, d, h, mi, s, tzid), isDateOnly: false };
  }
  return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s) - KST_OFFSET_MS), isDateOnly: false };
}

type Rrule = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count: number | null;
  until: Date | null;
  byDay: number[];
  byMonthDay: number[];
};

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function parseRrule(value: string): Rrule | null {
  const map: Record<string, string> = {};
  for (const part of value.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    map[part.slice(0, eq).trim().toUpperCase()] = part.slice(eq + 1).trim();
  }
  const freq = (map.FREQ ?? "").toUpperCase();
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    return null;
  }
  const interval = Math.max(1, Number(map.INTERVAL ?? 1) || 1);
  const count = map.COUNT ? Number(map.COUNT) || null : null;
  const until = map.UNTIL ? (parseIcalDateValue(map.UNTIL)?.date ?? null) : null;
  const byDay = (map.BYDAY ?? "")
    .split(",")
    .map((code) => WEEKDAY_CODES.indexOf(code.trim().slice(-2).toUpperCase()))
    .filter((i) => i >= 0);
  const byMonthDay = (map.BYMONTHDAY ?? "")
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n !== 0);

  return { freq, interval, count, until, byDay, byMonthDay };
}

/** KST 기준 달력 필드 */
function kstFields(d: Date) {
  const shifted = new Date(d.getTime() + KST_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    mo: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function addDaysKeepingTime(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function monthDiff(from: Date, to: Date): number {
  const a = kstFields(from);
  const b = kstFields(to);
  return (b.y - a.y) * 12 + (b.mo - a.mo);
}

function dayDiff(from: Date, to: Date): number {
  const a = new Date(from.getTime() + KST_OFFSET_MS);
  const b = new Date(to.getTime() + KST_OFFSET_MS);
  const aMid = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bMid = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bMid - aMid) / (24 * 60 * 60 * 1000));
}

function matchesRrule(rule: Rrule, start: Date, candidate: Date): boolean {
  const s = kstFields(start);
  const c = kstFields(candidate);

  if (rule.freq === "DAILY") {
    return dayDiff(start, candidate) % rule.interval === 0;
  }
  if (rule.freq === "WEEKLY") {
    const weeks = Math.floor(dayDiff(start, candidate) / 7);
    if (weeks % rule.interval !== 0) return false;
    return rule.byDay.length > 0 ? rule.byDay.includes(c.weekday) : c.weekday === s.weekday;
  }
  if (rule.freq === "MONTHLY") {
    if (monthDiff(start, candidate) % rule.interval !== 0) return false;
    return rule.byMonthDay.length > 0 ? rule.byMonthDay.includes(c.d) : c.d === s.d;
  }
  if ((c.y - s.y) % rule.interval !== 0) return false;
  return c.mo === s.mo && c.d === s.d;
}

function expandRecurrence(
  rule: Rrule,
  start: Date,
  durationMs: number,
  exdates: Set<number>,
  windowStart: Date,
  windowEnd: Date
): Date[] {
  const results: Date[] = [];
  let occurrences = 0;

  for (let offset = 0; offset < MAX_SCAN_DAYS; offset++) {
    const candidate = addDaysKeepingTime(start, offset);
    if (candidate.getTime() > windowEnd.getTime()) break;
    if (rule.until && candidate.getTime() > rule.until.getTime()) break;
    if (!matchesRrule(rule, start, candidate)) continue;

    occurrences++;
    if (rule.count && occurrences > rule.count) break;
    if (exdates.has(candidate.getTime())) continue;

    if (candidate.getTime() + durationMs >= windowStart.getTime()) {
      results.push(candidate);
      if (results.length >= MAX_OCCURRENCES) break;
    }
  }
  return results;
}

export type ParseIcalOptions = {
  windowStart?: Date;
  windowEnd?: Date;
};

/** .ics 텍스트에서 VEVENT 목록을 추출 (반복 일정은 창 범위 내로 전개) */
export function parseIcalEvents(text: string, options: ParseIcalOptions = {}): ParsedIcalEvent[] {
  const windowStart = options.windowStart ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const windowEnd = options.windowEnd ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const events: ParsedIcalEvent[] = [];
  let current: PropLine[] | null = null;

  for (const line of unfoldLines(text)) {
    const trimmed = line.trim();
    if (trimmed.toUpperCase() === "BEGIN:VEVENT") {
      current = [];
      continue;
    }
    if (trimmed.toUpperCase() === "END:VEVENT") {
      if (current) {
        events.push(...buildEvents(current, windowStart, windowEnd));
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const prop = parsePropLine(line);
    if (prop) current.push(prop);
  }

  return events;
}

function buildEvents(props: PropLine[], windowStart: Date, windowEnd: Date): ParsedIcalEvent[] {
  const find = (name: string) => props.find((p) => p.name === name);

  const dtstartProp = find("DTSTART");
  if (!dtstartProp) return [];
  const dtstart = parseIcalDateValue(dtstartProp.value, dtstartProp.params);
  if (!dtstart) return [];

  const dtendProp = find("DTEND");
  let end: Date;
  let isAllDay = dtstart.isDateOnly;

  if (dtendProp) {
    const parsedEnd = parseIcalDateValue(dtendProp.value, dtendProp.params);
    if (parsedEnd) {
      // all-day 의 DTEND 는 exclusive → inclusive 마지막 시각으로 보정
      end = parsedEnd.isDateOnly ? new Date(parsedEnd.date.getTime() - 1) : parsedEnd.date;
      isAllDay = isAllDay || parsedEnd.isDateOnly;
    } else {
      end = new Date(dtstart.date.getTime() + 60 * 60 * 1000);
    }
  } else if (isAllDay) {
    end = new Date(dtstart.date.getTime() + 24 * 60 * 60 * 1000 - 1);
  } else {
    const durationProp = find("DURATION");
    const durationMs = durationProp ? parseDurationMs(durationProp.value) : null;
    end = new Date(dtstart.date.getTime() + (durationMs ?? 60 * 60 * 1000));
  }

  if (end.getTime() < dtstart.date.getTime()) {
    end = new Date(dtstart.date.getTime() + (isAllDay ? 24 * 60 * 60 * 1000 - 1 : 60 * 60 * 1000));
  }

  const uid = find("UID")?.value.trim() || `no-uid-${dtstart.date.getTime()}`;
  const summary = unescapeText(find("SUMMARY")?.value ?? "").trim() || "(제목 없음)";
  const descriptionRaw = unescapeText(find("DESCRIPTION")?.value ?? "").trim();
  const locationRaw = unescapeText(find("LOCATION")?.value ?? "").trim();

  const base = {
    uid,
    summary,
    description: descriptionRaw ? descriptionRaw : null,
    location: locationRaw ? locationRaw : null,
    isAllDay,
  };

  const rruleProp = find("RRULE");
  const rule = rruleProp ? parseRrule(rruleProp.value) : null;
  const durationMs = end.getTime() - dtstart.date.getTime();

  if (!rule) {
    if (end.getTime() < windowStart.getTime() || dtstart.date.getTime() > windowEnd.getTime()) {
      return [];
    }
    return [{ ...base, start: dtstart.date, end }];
  }

  const exdates = new Set<number>();
  for (const prop of props.filter((p) => p.name === "EXDATE")) {
    for (const piece of prop.value.split(",")) {
      const parsed = parseIcalDateValue(piece, prop.params);
      if (parsed) exdates.add(parsed.date.getTime());
    }
  }

  return expandRecurrence(rule, dtstart.date, durationMs, exdates, windowStart, windowEnd).map(
    (occurrenceStart) => ({
      ...base,
      start: occurrenceStart,
      end: new Date(occurrenceStart.getTime() + durationMs),
    })
  );
}

function parseDurationMs(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    value.trim().toUpperCase()
  );
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const total =
    (Number(w ?? 0) * 7 * 24 * 60 * 60 +
      Number(d ?? 0) * 24 * 60 * 60 +
      Number(h ?? 0) * 60 * 60 +
      Number(mi ?? 0) * 60 +
      Number(s ?? 0)) *
    1000;
  return sign === "-" ? -total : total;
}
