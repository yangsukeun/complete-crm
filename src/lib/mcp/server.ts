import "server-only";

import { buildTools, callTool, describeTools } from "@/lib/mcp/tools";
import type { McpViewer } from "@/lib/mcp/oauth";

/**
 * MCP Streamable HTTP(무상태). 세션 없이 POST 한 번에 JSON 응답 하나를 돌려준다.
 * 지원 메서드: initialize, ping, tools/list, tools/call (알림·응답 메시지는 202로 받기만 한다)
 */

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const SERVER_INSTRUCTIONS =
  "회사 CRM 도구입니다. 연결한 직원 본인 계정 권한으로만 동작합니다. " +
  "'내 담당 단계'는 get_my_stages, 전체 프로젝트 단계 현황은 get_stage_overview를 쓰세요. " +
  "진행 저장·완료 처리 전에는 get_my_stages로 stageId를 확인하고, 완료 처리는 사용자에게 먼저 확인하세요. " +
  "답할 때 결과에 들어 있는 CRM 링크(pageUrl, projectUrl)를 함께 알려 주면 좋습니다.";

function ok(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function fail(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function handleOne(msg: JsonRpcRequest, viewer: McpViewer, origin: string) {
  const isRequest = msg.id !== undefined && msg.id !== null && typeof msg.method === "string";
  if (!isRequest) return null; // 알림(notifications/*)·클라이언트 응답

  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return ok(msg.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "complete-crm", title: "회사 CRM", version: "1.0.0" },
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: describeTools(buildTools(origin)) });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const result = await callTool(buildTools(origin), name, msg.params?.arguments, viewer);
      if (!result) return fail(msg.id, -32602, `알 수 없는 도구입니다: ${name}`);
      return ok(msg.id, result);
    }
    case "resources/list":
      return ok(msg.id, { resources: [] });
    case "prompts/list":
      return ok(msg.id, { prompts: [] });
    default:
      return fail(msg.id, -32601, `지원하지 않는 메서드입니다: ${msg.method}`);
  }
}

/** 단일 메시지 또는 배치. 돌려줄 응답이 없으면 null(202) */
export async function handleMcpBody(body: unknown, viewer: McpViewer, origin: string): Promise<unknown | null> {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleOne(m as JsonRpcRequest, viewer, origin)))).filter(Boolean);
    return out.length > 0 ? out : null;
  }
  if (!body || typeof body !== "object") return fail(null, -32600, "잘못된 요청입니다.");
  return handleOne(body as JsonRpcRequest, viewer, origin);
}
