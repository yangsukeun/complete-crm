import { parseIcalEvents, type ParsedIcalEvent } from "@/lib/ical-parse";

/**
 * 네이버 캘린더 읽기 전용 CalDAV 클라이언트.
 * 네이버는 calendar-query 응답에 calendar-data를 넣지 않고 href+etag만 주므로,
 * 본문은 calendar-multiget(또는 GET)으로 회수합니다.
 */

const CALDAV_BASE = "https://caldav.calendar.naver.com";
const REQUEST_TIMEOUT_MS = 15_000;
/** multiget 한 번에 넣을 href 상한 (네이버 응답 크기 대비) */
const MULTIGET_BATCH_SIZE = 40;

export type NaverCalDavAuth = { naverId: string; password: string };

export type NaverCalDavFetchResult = {
  events: ParsedIcalEvent[];
  /** calendar-query 가 돌려준 이벤트 리소스 수 */
  hrefCount: number;
  /** multiget/GET 으로 ICS 본문을 받은 리소스 수 */
  icsBodyCount: number;
};

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

/** multiget 바디용 — 상대/절대 href 모두 허용, XML 이스케이프 */
function hrefForXml(href: string): string {
  return href
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
      console.error("[NAVER_CALDAV]", {
        step: "findPrincipal",
        href: entry,
        message: err instanceof Error ? err.message : String(err),
      });
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
    const home = await findCalendarHome(auth, principalUrl).catch((err) => {
      console.error("[NAVER_CALDAV]", {
        step: "findCalendarHome",
        href: principalUrl,
        message: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
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
      console.error("[NAVER_CALDAV]", {
        step: "listCalendars",
        href: home,
        message: err instanceof Error ? err.message : String(err),
      });
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

/** 1단계: 기간 필터로 이벤트 리소스 href 목록만 수집 */
function calendarQueryBody(timeMin: Date, timeMax: Date): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${toCalDavStamp(timeMin)}" end="${toCalDavStamp(timeMax)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
}

function calendarMultigetBody(hrefs: string[]): string {
  const hrefTags = hrefs.map((h) => `  <d:href>${hrefForXml(h)}</d:href>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
${hrefTags}
</c:calendar-multiget>`;
}

/** query 응답에서 이벤트 리소스(.ics) href만 수집 */
function collectEventHrefs(xml: string): string[] {
  const hrefs: string[] = [];
  const seen = new Set<string>();
  for (const block of splitResponses(xml)) {
    const href = firstTagContent(block, "href");
    if (!href) continue;
    const path = href.trim();
    let decoded = path;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      /* keep raw */
    }
    if (!/\.ics(?:$|[?#])/i.test(decoded)) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    hrefs.push(path);
  }
  return hrefs;
}

function parseCalendarDataBlocks(
  xml: string,
  timeMin: Date,
  timeMax: Date
): { events: ParsedIcalEvent[]; bodyCount: number } {
  const events: ParsedIcalEvent[] = [];
  let bodyCount = 0;
  for (const match of xml.matchAll(tagPattern("calendar-data"))) {
    const ics = unescapeXml(match[1]);
    if (!/BEGIN:VEVENT/i.test(ics)) continue;
    bodyCount += 1;
    events.push(...parseIcalEvents(ics, { windowStart: timeMin, windowEnd: timeMax }));
  }
  return { events, bodyCount };
}

/** 2단계: href 목록으로 calendar-multiget (배치) */
async function fetchIcsViaMultiget(
  calendarUrl: string,
  auth: NaverCalDavAuth,
  hrefs: string[],
  timeMin: Date,
  timeMax: Date
): Promise<{ events: ParsedIcalEvent[]; bodyCount: number }> {
  const events: ParsedIcalEvent[] = [];
  let bodyCount = 0;

  for (let i = 0; i < hrefs.length; i += MULTIGET_BATCH_SIZE) {
    const batch = hrefs.slice(i, i + MULTIGET_BATCH_SIZE);
    let xml: string;
    try {
      xml = await davRequest("REPORT", calendarUrl, auth, calendarMultigetBody(batch), "1");
    } catch (err) {
      if (err instanceof NaverCalDavError && err.kind === "auth") throw err;
      console.error("[NAVER_CALDAV]", {
        step: "multiget",
        href: calendarUrl,
        status: err instanceof NaverCalDavError ? err.message : undefined,
        batchSize: batch.length,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    const parsed = parseCalendarDataBlocks(xml, timeMin, timeMax);
    events.push(...parsed.events);
    bodyCount += parsed.bodyCount;
  }

  return { events, bodyCount };
}

/** 지정 기간의 네이버 캘린더 일정 조회 */
export async function fetchNaverCalDavEvents(
  auth: NaverCalDavAuth,
  timeMin: Date,
  timeMax: Date
): Promise<NaverCalDavFetchResult> {
  const calendarUrls = await discoverNaverCalendarUrls(auth);
  if (calendarUrls.length === 0) {
    throw new NaverCalDavError("네이버 캘린더 목록을 찾지 못했습니다.", "protocol");
  }

  const queryBody = calendarQueryBody(timeMin, timeMax);
  const collected: ParsedIcalEvent[] = [];
  let hrefCount = 0;
  let icsBodyCount = 0;

  for (const url of calendarUrls) {
    // 1단계: calendar-query → href 목록
    let queryXml: string;
    try {
      queryXml = await davRequest("REPORT", url, auth, queryBody, "1");
    } catch (err) {
      if (err instanceof NaverCalDavError && err.kind === "auth") throw err;
      console.error("[NAVER_CALDAV]", {
        step: "calendar-query",
        href: url,
        message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const hrefs = collectEventHrefs(queryXml);
    hrefCount += hrefs.length;

    // 네이버가 드물게 query에 calendar-data를 넣는 경우도 흡수
    const inline = parseCalendarDataBlocks(queryXml, timeMin, timeMax);
    if (inline.bodyCount > 0) {
      collected.push(...inline.events);
      icsBodyCount += inline.bodyCount;
      continue;
    }

    if (hrefs.length === 0) continue;

    // 2단계: calendar-multiget으로 ICS 본문 회수
    const fetched = await fetchIcsViaMultiget(url, auth, hrefs, timeMin, timeMax);
    collected.push(...fetched.events);
    icsBodyCount += fetched.bodyCount;

    if (fetched.bodyCount === 0 && hrefs.length > 0) {
      console.error("[NAVER_CALDAV]", {
        step: "multiget-empty",
        href: url,
        status: "href>0 but calendar-data=0",
        hrefCount: hrefs.length,
      });
    }
  }

  const seen = new Set<string>();
  const events = collected.filter((e) => {
    const key = `${e.uid}|${e.start.getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { events, hrefCount, icsBodyCount };
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
