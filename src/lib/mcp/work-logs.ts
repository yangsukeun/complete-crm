import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { stripTaskStatusMarkers } from "@/lib/activity-log";
import { resolveEffectivePermissionsJson } from "@/lib/permissions-resolve";
import { canViewOthersDailyWorkLog, hasDailyReportMenuAccess } from "@/lib/work-log-access";
import { validWorkLogDate } from "@/lib/work-log-response";

export type WorkLogViewer = { id: string; role: string };

export class WorkLogToolError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = "WorkLogToolError";
  }
}

const AUTHOR_SELECT = { id: true, name: true, role: true, department: true, accountDisabled: true } as const;
const LOG_SELECT = { id: true, userId: true, date: true, content: true, status: true } as const;
type Author = Prisma.UserGetPayload<{ select: typeof AUTHOR_SELECT }>;
type WorkLog = Prisma.DailyWorkLogGetPayload<{ select: typeof LOG_SELECT }>;
type Scope = { viewer: Author; permissions: string | null; authors: Author[]; canReview: boolean };
type SectionKind = "today_work" | "tomorrow_plan" | "memo" | "other";
type Section = { section: SectionKind; heading: string | null; content: string };
type Position = { date: string; id: string };
type SearchInput = {
  query: string; groups: string[][]; authorName?: string; userId?: string;
  dateFrom?: string; dateTo?: string; limit: number; cursor?: string;
};

const TIMESTAMP_NOTE = "현재 업무일지에는 작성·수정 시각이 저장되지 않습니다. workDate는 업무일이며 createdAt/updatedAt은 확인할 수 없어 null입니다.";
const SECTION_NOTE = "단락은 원문의 제목으로 구분합니다. 내일 할일의 이월 표시도 원문 그대로이며, 단락이나 제출 상태를 입고 완료 사실로 해석하지 않습니다.";

function inputError(message: string): never {
  throw new WorkLogToolError("INVALID_ARGUMENT", message);
}

function stringArg(args: Record<string, unknown>, key: string, max: number, required = false): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    if (required) inputError(`${key} 값이 필요합니다.`);
    return undefined;
  }
  if (typeof value !== "string" || value.length > max || !value.trim()) {
    inputError(`${key}는 1~${max}자의 문자열이어야 합니다.`);
  }
  return value.trim();
}

function idArg(args: Record<string, unknown>, key: string, required = false) {
  const value = stringArg(args, key, 128, required);
  if (value && !/^[A-Za-z0-9_-]+$/.test(value)) inputError(`${key} 형식이 올바르지 않습니다.`);
  return value;
}

function searchInput(args: Record<string, unknown>): SearchInput {
  const rawQuery = stringArg(args, "query", 200, true)!;
  const query = rawQuery.normalize("NFKC").replace(/\s+/g, " ").trim();
  const tokens = query.replace(/빈\s+병/g, "빈병").replace(/공\s+병/g, "공병").split(" ")
    .flatMap((token) => token === "공병입고" || token === "빈병입고" ? [token.slice(0, 2), "입고"] : [token]);
  const groups = [...new Set(tokens)].map((token) =>
    token === "공병" || token === "빈병" ? ["공병", "빈병", "빈 병"] : [token]
  );
  const dateFrom = stringArg(args, "dateFrom", 10);
  const dateTo = stringArg(args, "dateTo", 10);
  for (const date of [dateFrom, dateTo]) if (date && !validWorkLogDate(date)) inputError("날짜는 실제 존재하는 YYYY-MM-DD 업무일이어야 합니다.");
  if (dateFrom && dateTo && dateFrom > dateTo) inputError("dateFrom은 dateTo보다 늦을 수 없습니다.");
  const limit = args.limit === undefined ? 20 : args.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 50) inputError("limit은 1~50 사이의 정수여야 합니다.");
  return {
    query, groups, dateFrom, dateTo, limit,
    userId: idArg(args, "userId"), authorName: stringArg(args, "authorName", 100),
    cursor: stringArg(args, "cursor", 2048),
  };
}

/** Never use the MCP/JWT role to widen access; the current database account is authoritative. */
async function readScope(viewer: WorkLogViewer): Promise<Scope> {
  if (!viewer.id) throw new WorkLogToolError("UNAUTHENTICATED", "로그인이 필요합니다.", 401);
  const current = await prisma.user.findUnique({ where: { id: viewer.id }, select: AUTHOR_SELECT });
  if (!current || current.accountDisabled) throw new WorkLogToolError("FORBIDDEN", "업무일지에 접근할 수 없습니다.", 403);
  // Permission resolution errors fail closed, rather than silently restoring role defaults.
  const permissions = await resolveEffectivePermissionsJson(current.id);
  const canReview = hasDailyReportMenuAccess({ ...current, permissions });
  if (!canReview) return { viewer: current, permissions, authors: [current], canReview };
  const users = await prisma.user.findMany({ select: AUTHOR_SELECT });
  const authors = users.filter((target) => canViewOthersDailyWorkLog({
    viewerId: current.id, viewerRole: current.role, viewerDepartment: current.department,
    viewerPermissions: permissions, target,
  }));
  if (!authors.some((author) => author.id === current.id)) authors.push(current);
  return { viewer: current, permissions, authors, canReview };
}

function compact(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function matchesGroup(text: string, group: string[]) {
  const value = compact(text);
  return group.some((term) => value.includes(compact(term)));
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function keywordWhere(groups: string[][]): Prisma.DailyWorkLogWhereInput[] {
  return groups.map((group) => {
    const alternatives: Prisma.DailyWorkLogWhereInput[] = group.map((term) => ({
      content: { contains: escapeLike(term), mode: "insensitive" },
    }));
    // Retain recall for spaced/newline bottle aliases; cleaned text excludes unrelated broad candidates.
    if (group.includes("빈병")) for (const prefix of ["빈", "공"]) alternatives.push({ AND: [
      { content: { contains: prefix } }, { content: { contains: "병" } },
    ] });
    return { OR: alternatives };
  });
}

function cursorFingerprint(input: SearchInput, scope: Scope, authorIds: string[]) {
  return createHash("sha256").update(JSON.stringify({
    viewer: scope.viewer.id, role: scope.viewer.role, department: scope.viewer.department,
    permissions: scope.permissions, authors: [...authorIds].sort(), groups: input.groups,
    userId: input.userId ?? null, authorName: input.authorName ?? null,
    dateFrom: input.dateFrom ?? null, dateTo: input.dateTo ?? null,
  })).digest("hex");
}

/** A cursor is an untrusted seek position, never an authorization token. Every page reapplies scope. */
function decodeCursor(value: string | undefined, fingerprint: string): Position | undefined {
  if (!value) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (parsed.v !== 1 || parsed.fingerprint !== fingerprint ||
      typeof parsed.date !== "string" || !validWorkLogDate(parsed.date) ||
      typeof parsed.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.id)) throw new Error();
    return { date: parsed.date, id: parsed.id };
  } catch {
    throw new WorkLogToolError("INVALID_CURSOR", "조회 조건 또는 권한이 변경되었거나 cursor가 올바르지 않습니다. 첫 페이지부터 다시 조회해 주세요.");
  }
}

function encodeCursor(position: Position, fingerprint: string) {
  return Buffer.from(JSON.stringify({ v: 1, ...position, fingerprint })).toString("base64url");
}

function afterPosition(position?: Position): Prisma.DailyWorkLogWhereInput {
  return position ? { OR: [
    { date: { lt: position.date } },
    { date: position.date, id: { lt: position.id } },
  ] } : {};
}

function headingKind(heading: string): SectionKind {
  const value = compact(heading);
  if (/내일|익일|다음날/.test(value)) return "tomorrow_plan";
  if (/메모|특이사항|비고|참고사항/.test(value)) return "memo";
  if (/오늘|금일|당일|완료한업무|진행중인업무|업무상태변경/.test(value)) return "today_work";
  return "other";
}

function splitSections(content: string): Section[] {
  const sections: Section[] = [];
  const stack: { level: number; section: SectionKind }[] = [];
  let current: Section = { section: "other", heading: null, content: "" };
  for (const line of content.split(/\r?\n/)) {
    const markdown = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    const plain = /^\s*(?:[-*]\s*)?(?:\*\*|\[)?((?:오늘|금일|당일|내일|익일|다음날)\s*(?:의\s*)?(?:업무|할\s*일|계획)|메모|특이사항|비고|참고사항)(?:\s*\([^\n]*\))?(?:\*\*|\])?\s*[:：]?\s*$/.exec(line);
    if (markdown || plain) {
      if (current.content.trim()) sections.push({ ...current, content: current.content.trim() });
      const heading = (markdown?.[2] ?? line.trim()).replace(/^\*\*|\*\*$/g, "");
      const level = markdown ? markdown[1].length : 2;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const classified = headingKind(heading);
      const section = classified === "other" ? (stack[stack.length - 1]?.section ?? "other") : classified;
      stack.push({ level, section });
      current = { section, heading, content: line + "\n" };
    } else current.content += line + "\n";
  }
  if (current.content.trim()) sections.push({ ...current, content: current.content.trim() });
  return sections;
}

function evidence(sections: Section[], groups: string[][]) {
  const matches: { section: SectionKind; heading: string | null; excerpt: string; matchedTerms: string[] }[] = [];
  let total = 0;
  for (const section of sections) {
    const lines = section.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      let line = lines[index];
      // Preserve the original line break when a matching word itself spans two adjacent lines.
      if (index + 1 < lines.length && groups.some((group) =>
        !matchesGroup(line, group) && !matchesGroup(lines[index + 1], group) && matchesGroup(line + "\n" + lines[index + 1], group)
      )) line += "\n" + lines[++index];
      const matched = groups.filter((group) => matchesGroup(line, group));
      if (!matched.length) continue;
      total++;
      if (matches.length >= 8) continue;
      // Keep the original wording, including negation/planned dates, rather than generating a status.
      const lower = line.toLowerCase();
      const positions = matched.flatMap((group) => group.map((term) => lower.indexOf(term.toLowerCase()))).filter((n) => n >= 0);
      const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 100);
      const end = Math.min(line.length, start + 600);
      matches.push({ section: section.section, heading: section.heading,
        excerpt: (start ? "…" : "") + line.slice(start, end) + (end < line.length ? "…" : ""),
        matchedTerms: matched.map((group) => group[0]),
      });
    }
  }
  return { matches, matchesTruncated: total > matches.length,
    allTermsInSameSection: sections.some((section) => groups.every((group) => matchesGroup(section.content, group))),
  };
}

function presentLog(log: WorkLog, author: Author, scope: Scope, origin: string) {
  const content = stripTaskStatusMarkers(log.content ?? "");
  const page = new URL(scope.canReview ? "/admin/logs" : "/tasks", origin);
  if (scope.canReview) {
    page.searchParams.set("userId", author.id);
    page.searchParams.set("date", log.date);
  }
  return {
    workLogId: log.id, workDate: log.date, status: log.status,
    createdAt: null, updatedAt: null,
    author: { id: author.id, name: author.name, department: author.department },
    pageUrl: page.toString(),
    pageUrlNote: author.accountDisabled
      ? "기존 Daily Report 화면에서는 비활성 직원을 선택할 수 없습니다. 이 기록의 원문은 get_work_log 도구로 확인할 수 있습니다."
      : scope.canReview ? null : `Daily Report 탭에서 업무일 ${log.date}를 선택해 주세요. 현재 본인 화면은 URL로 날짜를 지정하지 않습니다.`,
    content, sections: splitSections(content),
  };
}

/** Read existing saved logs only. In particular, do not call the GET API which can create own drafts. */
export async function searchWorkLogs(args: Record<string, unknown>, viewer: WorkLogViewer, origin: string) {
  const input = searchInput(args);
  const scope = await readScope(viewer);
  const authors = scope.authors.filter((author) =>
    (!input.userId || author.id === input.userId) &&
    (!input.authorName || compact(author.name).includes(compact(input.authorName)))
  );
  const authorIds = authors.map((author) => author.id);
  const fingerprint = cursorFingerprint(input, scope, authorIds);
  let position = decodeCursor(input.cursor, fingerprint);
  const base: Prisma.DailyWorkLogWhereInput = {
    userId: { in: authorIds },
    ...(input.dateFrom || input.dateTo ? { date: { gte: input.dateFrom, lte: input.dateTo } } : {}),
    AND: keywordWhere(input.groups),
  };
  const byAuthor = new Map(authors.map((author) => [author.id, author]));
  const hits: { row: WorkLog; item: ReturnType<typeof searchItem> }[] = [];
  let scanned = 0;
  let exhausted = !authorIds.length;
  // Bound marker-only/normalization false positives without loading the entire archive into memory.
  while (!exhausted && hits.length <= input.limit && scanned < 500) {
    const take = Math.min(Math.max(50, input.limit + 1), 500 - scanned);
    const rows = await prisma.dailyWorkLog.findMany({
      where: { AND: [base, afterPosition(position)] }, select: LOG_SELECT,
      orderBy: [{ date: "desc" }, { id: "desc" }], take,
    });
    exhausted = rows.length < take;
    for (const row of rows) {
      scanned++;
      position = { date: row.date, id: row.id };
      const author = byAuthor.get(row.userId);
      if (!author) continue;
      const clean = stripTaskStatusMarkers(row.content ?? "");
      if (!input.groups.every((group) => matchesGroup(clean, group))) continue;
      hits.push({ row, item: searchItem(row, author, scope, origin, input.groups) });
      if (hits.length > input.limit) break;
    }
  }
  const extraHit = hits.length > input.limit;
  const scanLimitReached = !extraHit && !exhausted && scanned >= 500;
  const shown = hits.slice(0, input.limit);
  const nextPosition = extraHit
    ? { date: shown[shown.length - 1].row.date, id: shown[shown.length - 1].row.id }
    : scanLimitReached ? position : undefined;
  return {
    query: input.query, dateBasis: "workDate", dateFrom: input.dateFrom ?? null, dateTo: input.dateTo ?? null,
    items: shown.map((hit) => hit.item), count: shown.length, limit: input.limit,
    nextCursor: nextPosition ? encodeCursor(nextPosition, fingerprint) : null,
    hasMore: !!nextPosition, scanLimitReached,
    timestampNote: TIMESTAMP_NOTE, sectionNote: SECTION_NOTE,
  };
}

function searchItem(log: WorkLog, author: Author, scope: Scope, origin: string, groups: string[][]) {
  const { content: _content, sections, ...item } = presentLog(log, author, scope, origin);
  return { ...item, ...evidence(sections, groups) };
}

export async function getWorkLog(args: Record<string, unknown>, viewer: WorkLogViewer, origin: string) {
  const workLogId = idArg(args, "workLogId", true)!;
  const scope = await readScope(viewer);
  const log = await prisma.dailyWorkLog.findFirst({
    where: { id: workLogId, userId: { in: scope.authors.map((author) => author.id) } },
    select: LOG_SELECT,
  });
  const author = log && scope.authors.find((candidate) => candidate.id === log.userId);
  if (!log || !author) throw new WorkLogToolError("WORK_LOG_NOT_FOUND", "조회할 수 있는 업무일지를 찾을 수 없습니다.", 404);
  return { ...presentLog(log, author, scope, origin), timestampNote: TIMESTAMP_NOTE, sectionNote: SECTION_NOTE };
}
