import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  user: vi.fn(), users: vi.fn(), logs: vi.fn(), detail: vi.fn(), permissions: vi.fn(),
  create: vi.fn(), update: vi.fn(), upsert: vi.fn(), remove: vi.fn(), count: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ default: {
  user: { findUnique: f.user, findMany: f.users },
  dailyWorkLog: { findMany: f.logs, findFirst: f.detail, create: f.create, update: f.update, upsert: f.upsert, delete: f.remove, count: f.count },
} }));
vi.mock("@/lib/permissions-resolve", () => ({ resolveEffectivePermissionsJson: f.permissions }));

import { getWorkLog, searchWorkLogs } from "@/lib/mcp/work-logs";
import { GOPRO_LOG_REVIEWER, MARKETING_LOG_REVIEWER, MARKETING_LOG_TARGETS } from "@/lib/work-log-review-scope";
import { WORKSPACE_OWNER } from "@/lib/workspace-areas";

type User = { id: string; name: string; role: string; department: string | null; accountDisabled: boolean };
type Log = { id: string; userId: string; date: string; content: string; status: "DRAFT" | "SUBMITTED" };
const origin = "https://crm.example.test";
const user = (id: string, role = "USER", department = "마케팅", extra: Partial<User> = {}): User =>
  ({ id, role, department, name: id, accountDisabled: false, ...extra });
const log = (id: string, userId: string, content = "## 오늘 업무\n공병 입고 확인", date = "2026-11-17", status: Log["status"] = "SUBMITTED"): Log =>
  ({ id, userId, content, date, status });
let users: User[];
let logs: Log[];

// Small database fixture: enforce the submitted predicates instead of returning unscoped canned rows.
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === "AND") return (Array.isArray(condition) ? condition : [condition]).every((part) => matches(row, part));
    if (key === "OR") return (condition as Record<string, unknown>[]).some((part) => matches(row, part));
    const value = row[key];
    if (!condition || typeof condition !== "object") return value === condition;
    const filter = condition as Record<string, unknown>;
    return Object.entries(filter).every(([op, target]) => {
      if (target === undefined || op === "mode") return true;
      if (op === "in") return (target as unknown[]).includes(value);
      if (op === "equals") return value === target;
      if (op === "lt") return String(value) < String(target);
      if (op === "lte") return String(value) <= String(target);
      if (op === "gte") return String(value) >= String(target);
      if (op === "contains") {
        const needle = String(target).replace(/\\([\\%_])/g, "$1");
        return filter.mode === "insensitive"
          ? String(value).toLowerCase().includes(needle.toLowerCase()) : String(value).includes(needle);
      }
      throw new Error(`Unsupported fixture predicate: ${op}`);
    });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  users = [user("staff"), user("peer"), user("other", "USER", "CS팀"), user("lead", "TEAM_LEAD"), user("owner", "ADMIN", "경영지원")];
  logs = [log("own-log", "staff"), log("peer-log", "peer"), log("other-log", "other"), log("lead-log", "lead"), log("owner-log", "owner")];
  f.user.mockImplementation(async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id) ?? null);
  f.users.mockImplementation(async () => users.map((u) => ({ ...u })));
  f.permissions.mockResolvedValue(null);
  f.logs.mockImplementation(async ({ where, take }: { where: Record<string, unknown>; take: number }) =>
    logs.filter((row) => matches(row, where)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, take));
  f.detail.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => logs.find((row) => matches(row, where)) ?? null);
});

describe("MCP work-log permission boundary", () => {
  it("uses the current database role and scopes queries before returning records or counts", async () => {
    const result = await searchWorkLogs({ query: "공병 입고" }, { id: "staff", role: "ADMIN" }, origin);
    expect(result.items.map((item) => item.workLogId)).toEqual(["own-log"]);
    expect(result.count).toBe(1);
    expect(f.logs.mock.calls[0][0].where.AND[0].userId).toEqual({ in: ["staff"] });
    expect(f.users).not.toHaveBeenCalled();
    expect(f.count).not.toHaveBeenCalled();
    expect(result.items[0].pageUrl).toBe(`${origin}/tasks`);
    expect(result.items[0].pageUrlNote).toContain("2026-11-17");
  });

  it("applies effective staff/other-department permissions without allowing leads or executives", async () => {
    f.permissions.mockResolvedValue(JSON.stringify(["work_log_view_staff", "work_log_view_other_dept"]));
    const result = await searchWorkLogs({ query: "공병" }, { id: "staff", role: "USER" }, origin);
    expect(new Set(result.items.map((item) => item.author.id))).toEqual(new Set(["staff", "peer", "other"]));
    expect(f.permissions).toHaveBeenCalledWith("staff");
    expect(result.items.find((item) => item.author.id === "peer")?.pageUrl).toBe(`${origin}/admin/logs?userId=peer&date=2026-11-17`);
  });

  it("allows a current administrator to read all roles, including archived account records", async () => {
    users.push(user("archived", "USER", "물류", { accountDisabled: true }));
    logs.push(log("archived-log", "archived"));
    const result = await searchWorkLogs({ query: "공병" }, { id: "owner", role: "USER" }, origin);
    expect(result.items).toHaveLength(6);
    expect(result.items.map((item) => item.workLogId)).toContain("archived-log");
    expect(result.items.find((item) => item.workLogId === "archived-log")?.pageUrlNote).toContain("비활성 직원을 선택할 수 없습니다");
    expect((await getWorkLog({ workLogId: "archived-log" }, { id: "owner", role: "ADMIN" }, origin)).pageUrlNote).toContain("get_work_log");
  });

  it("preserves the exact marketing reviewer exception and excludes moved, disabled or unlisted staff", async () => {
    const [allowed, moved, disabled] = [...MARKETING_LOG_TARGETS];
    users.push(user(MARKETING_LOG_REVIEWER, "TEAM_LEAD"), user(allowed), user(moved, "USER", "CS팀"), user(disabled, "USER", "마케팅", { accountDisabled: true }));
    logs.push(log("allowed-log", allowed), log("moved-log", moved), log("disabled-log", disabled));
    const result = await searchWorkLogs({ query: "공병" }, { id: MARKETING_LOG_REVIEWER, role: "ADMIN" }, origin);
    expect(result.items.map((item) => item.workLogId)).toEqual(["allowed-log"]);
    expect(f.logs.mock.calls[0][0].where.AND[0].userId.in).toEqual(expect.arrayContaining([allowed, MARKETING_LOG_REVIEWER]));
  });

  it("preserves the management reviewer exception without privilege-role escape", async () => {
    users.push(user(GOPRO_LOG_REVIEWER, "USER", "경영지원"), user(WORKSPACE_OWNER, "USER", "경영지원"));
    logs.push(log("workspace-owner-log", WORKSPACE_OWNER));
    const viewer = { id: GOPRO_LOG_REVIEWER, role: "ADMIN" };
    const result = await searchWorkLogs({ query: "공병" }, viewer, origin);
    expect(new Set(result.items.map((item) => item.author.id))).toEqual(new Set(["staff", "peer", "other"]));
    users.find((u) => u.id === GOPRO_LOG_REVIEWER)!.role = "ADMIN";
    const changed = await searchWorkLogs({ query: "공병" }, viewer, origin);
    expect(changed.items).toEqual([]);
  });

  it("does not reveal whether an inaccessible author or work-log ID exists", async () => {
    const viewer = { id: "staff", role: "USER" };
    expect((await searchWorkLogs({ query: "공병", authorName: "peer" }, viewer, origin)).items).toEqual([]);
    expect((await searchWorkLogs({ query: "공병", userId: "missing-user" }, viewer, origin)).items).toEqual([]);
    expect(f.logs).not.toHaveBeenCalled();
    for (const workLogId of ["peer-log", "does-not-exist"]) {
      await expect(getWorkLog({ workLogId }, viewer, origin)).rejects.toMatchObject({ code: "WORK_LOG_NOT_FOUND", status: 404, message: "조회할 수 있는 업무일지를 찾을 수 없습니다." });
    }
    expect(f.detail.mock.calls.every(([args]) => JSON.stringify(args.where.userId) === JSON.stringify({ in: ["staff"] }))).toBe(true);
  });

  it("rejects missing or disabled viewers and fails closed when permission resolution fails", async () => {
    users.find((u) => u.id === "staff")!.accountDisabled = true;
    await expect(searchWorkLogs({ query: "공병" }, { id: "staff", role: "ADMIN" }, origin)).rejects.toMatchObject({ status: 403 });
    await expect(getWorkLog({ workLogId: "own-log" }, { id: "missing", role: "ADMIN" }, origin)).rejects.toMatchObject({ status: 403 });
    f.permissions.mockRejectedValueOnce(new Error("permission lookup unavailable"));
    await expect(searchWorkLogs({ query: "공병" }, { id: "owner", role: "ADMIN" }, origin)).rejects.toThrow("permission lookup unavailable");
    expect(f.logs).not.toHaveBeenCalled();
    expect(f.detail).not.toHaveBeenCalled();
  });

  it("rechecks permission changes on a later detail call", async () => {
    const viewer = { id: "staff", role: "ADMIN" };
    f.permissions.mockResolvedValue(JSON.stringify(["work_log_view_staff"]));
    expect((await getWorkLog({ workLogId: "peer-log" }, viewer, origin)).author.id).toBe("peer");
    f.permissions.mockResolvedValue("[]");
    await expect(getWorkLog({ workLogId: "peer-log" }, viewer, origin)).rejects.toMatchObject({ status: 404 });
  });
});

describe("MCP work-log search and original evidence", () => {
  it.each(["공병입고", "빈병입고"])("finds spaced aliases for the joined query %s", async (query) => {
    logs = [
      log("empty-bottles", "staff", "## 오늘 업무\n공병 입고 확인", "2026-11-17"),
      log("other-alias", "staff", "## 내일 할일\n빈병 입고 예정", "2026-11-16"),
      log("not-bottles", "staff", "공급사 병원 상품 입고 확인", "2026-11-15"),
    ];
    const result = await searchWorkLogs({ query }, { id: "staff", role: "USER" }, origin);
    expect(result.items.map((item) => item.workLogId)).toEqual(["empty-bottles", "other-alias"]);
  });

  it("finds spaced/newline bottle words but rejects unrelated broad SQL candidates", async () => {
    logs = [
      log("space", "staff", "## 오늘 업무\n공 병 입고 확인", "2026-11-17"),
      log("newline", "staff", "## 내일 할일\n공\n병 입고 예정", "2026-11-16"),
      log("empty-newline", "staff", "## 메모\n빈\n병 입고 확인 필요", "2026-11-15"),
      log("unrelated-a", "staff", "공급사 병원 상품 입고", "2026-11-14"),
      log("unrelated-b", "staff", "빈 상자와 병뚜껑 입고", "2026-11-13"),
    ];
    const result = await searchWorkLogs({ query: "공병 입고" }, { id: "staff", role: "USER" }, origin);
    expect(result.items.map((item) => item.workLogId)).toEqual(["space", "newline", "empty-newline"]);
    expect(result.items[1].matches[0]).toMatchObject({ section: "tomorrow_plan", excerpt: "공\n병 입고 예정" });
    expect(result.items[2].matches[0].excerpt).toBe("빈\n병 입고 확인 필요");
  });

  it.each(["공병 입고", "  빈   병  입고  "])("AND-matches aliases and joined text for %s", async (query) => {
    logs = [
      log("joined", "staff", "## 오늘 업무\n공병입고 20개 확인", "2026-11-17"),
      log("spaced", "staff", "## 내일 할일\n빈  병 입고 예정: 11월 18일", "2026-11-16"),
      log("no-receipt", "staff", "공병 출고 확인", "2026-11-15"),
      log("no-bottle", "staff", "상품 입고 확인", "2026-11-14"),
    ];
    const result = await searchWorkLogs({ query }, { id: "staff", role: "USER" }, origin);
    expect(result.items.map((item) => item.workLogId)).toEqual(["joined", "spaced"]);
    expect(result.items[0].matches[0]).toMatchObject({ section: "today_work", excerpt: "공병입고 20개 확인" });
    expect(result.items[1].matches[0]).toMatchObject({ section: "tomorrow_plan", excerpt: "빈  병 입고 예정: 11월 18일" });
    expect(result.items[1]).not.toHaveProperty("receiptStatus");
  });

  it("keeps today, tomorrow, memo and nested headings separate, without inferring arrival completion", async () => {
    logs = [log("sections", "staff", "## 오늘 업무\n공병 공급처 문의\n## 내일 할일 (전날에서 이월)\n### 거래처 A\n입고 일정 확인 예정\n## 메모\n미입고 상태 유지\n<!--task-status:private-task:DONE-->")];
    const result = await searchWorkLogs({ query: "공병 입고" }, { id: "staff", role: "USER" }, origin);
    expect(result.items[0].allTermsInSameSection).toBe(false);
    expect(result.items[0].matches.map((match) => match.section)).toEqual(["today_work", "tomorrow_plan", "memo"]);
    const detail = await getWorkLog({ workLogId: "sections" }, { id: "staff", role: "USER" }, origin);
    expect(detail.content).toContain("미입고 상태 유지");
    expect(detail.content).not.toContain("task-status");
    expect(JSON.stringify(detail.sections)).not.toContain("private-task");
    expect(detail.sections.find((section) => section.heading === "거래처 A")?.section).toBe("tomorrow_plan");
    expect(detail.status).toBe("SUBMITTED");
  });

  it("does not return a match found only in an internal status marker", async () => {
    logs = [log("marker-only", "staff", "본문 메모\n<!--task-status:hidden-task:DONE-->")];
    const result = await searchWorkLogs({ query: "hidden-task" }, { id: "staff", role: "USER" }, origin);
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("filters the inclusive work-date range and reports unavailable timestamps honestly", async () => {
    logs = [log("before", "staff", "공병 입고", "2026-11-01"), log("range", "staff", "공병 입고", "2026-11-02", "DRAFT"), log("after", "staff", "공병 입고", "2026-11-03")];
    const result = await searchWorkLogs({ query: "공병", dateFrom: "2026-11-02", dateTo: "2026-11-02" }, { id: "staff", role: "USER" }, origin);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ workLogId: "range", workDate: "2026-11-02", status: "DRAFT", createdAt: null, updatedAt: null });
    expect(result.dateBasis).toBe("workDate");
    expect(result.timestampNote).toContain("저장되지 않습니다");
  });

  it("applies author name and ID filters only within the current permitted set", async () => {
    users.find((u) => u.id === "peer")!.name = "테스트 직원";
    const result = await searchWorkLogs({ query: "공병", authorName: "테스트직원", userId: "peer" }, { id: "owner", role: "ADMIN" }, origin);
    expect(result.items.map((item) => item.author.name)).toEqual(["테스트 직원"]);
    expect((await searchWorkLogs({ query: "공병", authorName: "테스트직원", userId: "other" }, { id: "owner", role: "ADMIN" }, origin)).items).toEqual([]);
  });

  it.each([
    { query: "" }, { query: "x".repeat(201) }, { query: "공병", dateFrom: "2026-02-30" },
    { query: "공병", dateTo: "2026-13-01" }, { query: "공병", dateFrom: "2026-11-18", dateTo: "2026-11-17" },
    { query: "공병", limit: 0 }, { query: "공병", limit: 51 }, { query: "공병", limit: 1.5 }, { query: "공병", limit: "20" },
  ])("rejects invalid input before querying: %j", async (args) => {
    await expect(searchWorkLogs(args, { id: "staff", role: "USER" }, origin)).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    expect(f.user).not.toHaveBeenCalled();
    expect(f.logs).not.toHaveBeenCalled();
  });

  it("reads existing rows without any create, update, delete, upsert or global count", async () => {
    const snapshot = JSON.stringify(logs);
    await searchWorkLogs({ query: "공병" }, { id: "owner", role: "ADMIN" }, origin);
    await getWorkLog({ workLogId: "own-log" }, { id: "staff", role: "USER" }, origin);
    expect(JSON.stringify(logs)).toBe(snapshot);
    for (const mutation of [f.create, f.update, f.upsert, f.remove, f.count]) expect(mutation).not.toHaveBeenCalled();
  });
});

describe("MCP work-log pagination", () => {
  it("uses date and ID keysets so a newly inserted newer record does not duplicate the next page", async () => {
    const viewer = { id: "owner", role: "ADMIN" };
    const first = await searchWorkLogs({ query: "공병 입고", limit: 2 }, viewer, origin);
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    logs.push(log("newer-log", "staff", "공병 입고", "2026-11-18"));
    const second = await searchWorkLogs({ query: "공병 입고", limit: 2, cursor: first.nextCursor }, viewer, origin);
    const third = await searchWorkLogs({ query: "공병 입고", limit: 2, cursor: second.nextCursor }, viewer, origin);
    const ids = [...first.items, ...second.items, ...third.items].map((item) => item.workLogId);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(ids).not.toContain("newer-log");
    expect(third.nextCursor).toBeNull();
    expect(f.logs.mock.calls.every(([args]) => args.orderBy[0].date === "desc" && args.orderBy[1].id === "desc" && args.take <= 51)).toBe(true);
  });

  it("rejects malformed, cross-query and cross-viewer cursors, and reapplies changed permissions", async () => {
    const first = await searchWorkLogs({ query: "공병", limit: 1 }, { id: "owner", role: "ADMIN" }, origin);
    for (const args of [{ query: "공병", cursor: "%%%" }, { query: "입고", cursor: first.nextCursor }]) {
      await expect(searchWorkLogs(args, { id: "owner", role: "ADMIN" }, origin)).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    }
    await expect(searchWorkLogs({ query: "공병", cursor: first.nextCursor }, { id: "staff", role: "USER" }, origin)).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    users.find((u) => u.id === "owner")!.role = "USER";
    await expect(searchWorkLogs({ query: "공병", cursor: first.nextCursor }, { id: "owner", role: "ADMIN" }, origin)).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    expect(f.logs).toHaveBeenCalledTimes(1);
  });
});
