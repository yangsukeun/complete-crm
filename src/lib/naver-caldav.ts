import { parseIcalEvents, type ParsedIcalEvent } from "@/lib/ical-parse";

/**
 * 네이버 캘린더 읽기 전용 CalDAV 클라이언트.
 * 네이버는 구독용 ICS URL을 제공하지 않아 CalDAV(RFC 4791)로만 자동 조회가 가능합니다.
 */

const CALDAV_BASE = "https://caldav.calendar.naver.com";
const REQUEST_TIMEOUT_MS = 15_000;

export type NaverCalDavAuth = { naverId: string; password: string };

export class NaverCalDavError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "network" | "protocol"
  ) {
    super(message);
    this.name = "NaverCalDavError";
  }
}

function basicAuthHeader({ naverId, password }: NaverCalDavAuth): string {
  return `Basic ${Buffer.from(`${naverId}:${password}`, "utf8").toString("base64")}`;
}

async function davRequest(
  method: "PROPFIND" | "REPORT",
  url: string,
  auth: NaverCalDavAuth,
  body: string,
  depth: "0" | "1"
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: basicAuthHeader(auth),
        "Content-Type": "application/xml; charset=utf-8",
        Depth: depth,
        "User-Agent": "complete-crm-caldav/1.0",
      },
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new NaverCalDavError(
      `네이버 캘린더 서버에 연결하지 못했습니다. (${err instanceof Error ? err.message : "unknown"})`,
      "network"
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new NaverCalDavError(
      "네이버 아이디 또는 앱 비밀번호가 올바르지 않습니다. 2단계 인증을 쓰면 애플리케이션 비밀번호가 필요합니다.",
      "auth"
    );
  }
  if (res.status >= 400) {
    throw new NaverCalDavError(`네이버 CalDAV 오류 (HTTP ${res.status})`, "protocol");
  }
  return res.text();
}

function tagPattern(localName: string, flags = "gi"): RegExp {
  return new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${localName}>`,
    flags
  );
}

function firstTagContent(xml: string, localName: string): string | null {
  const m = tagPattern(localName, "i").exec(xml);
  return m ? m[1].trim() : null;
}

function splitResponses(xml: string): string[] {
  return [...xml.matchAll(tagPattern("response"))].map((m) => m[1]);
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#13;/g, "")
    .replace(/&amp;/g, "&");
}

function absoluteUrl(href: string): string {
  const trimmed = href.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${CALDAV_BASE}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

const PROPFIND_PRINCIPAL = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;

const PROPFIND_HOME = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;

const PROPFIND_CALENDARS = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>`;

async function findPrincipalUrl(auth: NaverCalDavAuth): Promise<string | null> {
  for (const entry of [`${CALDAV_BASE}/`, `${CALDAV_BASE}/.well-known/caldav`]) {
    try {
      const xml = await davRequest("PROPFIND", entry, auth, PROPFIND_PRINCIPAL, "0");
      const block = firstTagContent(xml, "current-user-principal");
      const href = block ? firstTagContent(block, "href") : null;
      if (href) return absoluteUrl(href);
    } catch (err) {
      if (err instanceof NaverCalDavError && err.kind === "auth") throw err;
    }
  }
  return null;
}

async function findCalendarHome(auth: NaverCalDavAuth, principalUrl: string): Promise<string | null> {
  const xml = await davRequest("PROPFIND", principalUrl, auth, PROPFIND_HOME, "0");
  const block = firstTagContent(xml, "calendar-home-set");
  const href = block ? firstTagContent(block, "href") : null;
  return href ? absoluteUrl(href) : null;
}

/** 캘린더 탐색은 PROPFIND 3회가 필요해 결과를 짧게 캐시 */
const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const discoveryCache = new Map<string, { urls: string[]; expiresAt: number }>();

/** 사용자 캘린더 컬렉션 URL 목록 */
export async function discoverNaverCalendarUrls(auth: NaverCalDavAuth): Promise<string[]> {
  const cached = discoveryCache.get(auth.naverId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.urls;
  }

  const candidates: string[] = [];

  const principalUrl = await findPrincipalUrl(auth);
  if (principalUrl) {
    const home = await findCalendarHome(auth, principalUrl).catch(() => null);
    if (home) candidates.push(home);
  }
  // 탐색 실패 대비: 네이버 관례 경로
  candidates.push(`${CALDAV_BASE}/caldav/${encodeURIComponent(auth.naverId)}/`);

  for (const home of candidates) {
    let xml: string;
    try {
      xml = await davRequest("PROPFIND", home, auth, PROPFIND_CALENDARS, "1");
    } catch (err) {
      if (err instanceof NaverCalDavError && err.kind === "auth") throw err;
      continue;
    }

    const urls: string[] = [];
    for (const block of splitResponses(xml)) {
      const resourceType = firstTagContent(block, "resourcetype") ?? "";
      const isCalendar = /<(?:[A-Za-z0-9_.-]+:)?calendar(?:\s[^>]*)?\/?>/i.test(resourceType);
      if (!isCalendar) continue;
      const href = firstTagContent(block, "href");
      if (href) urls.push(absoluteUrl(href));
    }
    if (urls.length > 0) {
      discoveryCache.set(auth.naverId, { urls, expiresAt: Date.now() + DISCOVERY_TTL_MS });
      return urls;
    }
  }

  return [];
}

/** 연결 해제·재연결 시 캐시 무효화 */
export function clearNaverCalendarDiscoveryCache(naverId?: string): void {
  if (naverId) discoveryCache.delete(naverId);
  else discoveryCache.clear();
}

function toCalDavStamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "")}Z`;
}

function calendarQueryBody(timeMin: Date, timeMax: Date): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${toCalDavStamp(timeMin)}" end="${toCalDavStamp(timeMax)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
}

/** 지정 기간의 네이버 캘린더 일정 조회 */
export async function fetchNaverCalDavEvents(
  auth: NaverCalDavAuth,
  timeMin: Date,
  timeMax: Date
): Promise<ParsedIcalEvent[]> {
  const calendarUrls = await discoverNaverCalendarUrls(auth);
  if (calendarUrls.length === 0) {
    throw new NaverCalDavError("네이버 캘린더 목록을 찾지 못했습니다.", "protocol");
  }

  const body = calendarQueryBody(timeMin, timeMax);
  const collected: ParsedIcalEvent[] = [];

  for (const url of calendarUrls) {
    let xml: string;
    try {
      xml = await davRequest("REPORT", url, auth, body, "1");
    } catch (err) {
      if (err instanceof NaverCalDavError && err.kind === "auth") throw err;
      continue;
    }
    for (const match of xml.matchAll(tagPattern("calendar-data"))) {
      const ics = unescapeXml(match[1]);
      if (!/BEGIN:VEVENT/i.test(ics)) continue;
      collected.push(...parseIcalEvents(ics, { windowStart: timeMin, windowEnd: timeMax }));
    }
  }

  const seen = new Set<string>();
  return collected.filter((e) => {
    const key = `${e.uid}|${e.start.getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 연결 시 자격증명 검증 */
export async function verifyNaverCalDavAuth(auth: NaverCalDavAuth): Promise<void> {
  const urls = await discoverNaverCalendarUrls(auth);
  if (urls.length === 0) {
    throw new NaverCalDavError(
      "로그인은 되었지만 캘린더를 찾지 못했습니다. 네이버 캘린더에서 CalDAV 사용이 가능한 계정인지 확인해 주세요.",
      "protocol"
    );
  }
}
