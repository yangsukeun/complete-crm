import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ search: vi.fn(), detail: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ default: {} }));
vi.mock("@/lib/rua-summary", () => ({ summaryCommand: vi.fn() }));
vi.mock("@/lib/rua-store", () => ({ openRuaStore: vi.fn() }));
vi.mock("@/lib/rua-processing-postgres", () => ({ readRuaProcessing: vi.fn(), applyRuaProcessing: vi.fn() }));
vi.mock("@/lib/task-stages", () => ({
  StageError: class StageError extends Error {},
  getAssigneeStages: vi.fn(), getStageOverview: vi.fn(), getStageProgressLogs: vi.fn(),
  getTaskStages: vi.fn(), saveMyStageProgress: vi.fn(), setMyStageCompleted: vi.fn(),
}));
vi.mock("@/lib/mcp/work-logs", () => ({
  searchWorkLogs: calls.search,
  getWorkLog: calls.detail,
  WorkLogToolError: class WorkLogToolError extends Error {
    constructor(public code: string, message: string, public status = 400) { super(message); }
  },
}));

import { handleMcpBody } from "../src/lib/mcp/server";
import { WorkLogToolError } from "../src/lib/mcp/work-logs";

const viewer = { id: "synthetic-staff", name: "검증 사용자", role: "USER" };
const origin = "https://crm.test";
const request = (method: string, params?: Record<string, unknown>) => ({ jsonrpc: "2.0", id: 7, method, params });

describe("MCP work-log protocol integration", () => {
  beforeEach(() => vi.resetAllMocks());

  it("discovers both new tools as read-only alongside the existing stage tools", async () => {
    const response = await handleMcpBody(request("tools/list"), viewer, origin) as {
      result: { tools: { name: string; annotations: Record<string, unknown>; inputSchema: Record<string, unknown> }[] };
    };
    const tools = response.result.tools;
    expect(tools.some((tool) => tool.name === "get_my_stages")).toBe(true);
    for (const name of ["search_work_logs", "get_work_log"]) {
      expect(tools.find((tool) => tool.name === name)?.annotations).toMatchObject({
        readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
      });
    }
    expect(tools.find((tool) => tool.name === "search_work_logs")?.inputSchema.required).toEqual(["query"]);
    expect(tools.find((tool) => tool.name === "get_work_log")?.inputSchema.required).toEqual(["workLogId"]);
    expect(calls.search).not.toHaveBeenCalled();
    expect(calls.detail).not.toHaveBeenCalled();
  });

  it("passes the authenticated account to search and returns structured evidence", async () => {
    const result = { items: [{ workLogId: "synthetic-log", workDate: "2026-11-16", matches: [{ section: "tomorrow_plan", excerpt: "공병 입고 예정" }] }], nextCursor: null };
    calls.search.mockResolvedValue(result);
    const args = { query: "공병 입고", authorName: "물류 검증", limit: 10 };
    const response = await handleMcpBody(request("tools/call", { name: "search_work_logs", arguments: args }), viewer, origin) as {
      result: { structuredContent: unknown; content: { text: string }[] };
    };
    expect(calls.search).toHaveBeenCalledWith(args, viewer, origin);
    expect(response.result.structuredContent).toEqual(result);
    expect(JSON.parse(response.result.content[0].text)).toEqual(result);
  });

  it("uses the same account for detail and returns safe authorization errors", async () => {
    calls.detail.mockRejectedValue(new WorkLogToolError("WORK_LOG_NOT_FOUND", "조회할 수 있는 업무일지를 찾을 수 없습니다.", 404));
    const args = { workLogId: "synthetic-other-log" };
    const response = await handleMcpBody(request("tools/call", { name: "get_work_log", arguments: args }), viewer, origin) as {
      result: { isError: boolean; content: { text: string }[] };
    };
    expect(calls.detail).toHaveBeenCalledWith(args, viewer, origin);
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toBe("조회할 수 있는 업무일지를 찾을 수 없습니다.");
  });

  it("does not expose internal database errors through the tool response", async () => {
    calls.search.mockRejectedValue(new Error("synthetic-private-database-detail"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await handleMcpBody(request("tools/call", { name: "search_work_logs", arguments: { query: "공병" } }), viewer, origin);
      expect(JSON.stringify(response)).not.toContain("synthetic-private-database-detail");
      expect(response).toMatchObject({ result: { isError: true } });
    } finally { quiet.mockRestore(); }
  });
});
