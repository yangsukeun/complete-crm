import "server-only";

import prisma from "@/lib/prisma";
import {
  getAssigneeStages,
  getStageOverview,
  getStageProgressLogs,
  getTaskStages,
  saveMyStageProgress,
  setMyStageCompleted,
  StageError,
  type StageViewer,
} from "@/lib/task-stages";
import type { McpViewer } from "@/lib/mcp/oauth";

/**
 * CRM MCP 도구. 권한은 화면·API와 같은 함수(task-stages 등)를 그대로 거친다.
 * 읽기 도구는 readOnlyHint=true, 쓰기 도구는 AI 앱이 실행 전에 사용자 확인을 받는다.
 */

type JsonSchema = Record<string, unknown>;

type ToolDef = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  readOnly: boolean;
  run: (args: Record<string, unknown>, viewer: McpViewer) => Promise<unknown>;
};

export class ToolInputError extends Error {}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) throw new ToolInputError(`${key} 값이 필요합니다.`);
  return v.trim();
}

function stageViewer(v: McpViewer): StageViewer {
  return { id: v.id, role: v.role };
}

/** 상대 경로 링크를 CRM 주소로 바꿔 AI가 그대로 보여 줄 수 있게 한다 */
function absolute(origin: string, link: string | null | undefined): string | null {
  if (!link) return null;
  return link.startsWith("/") ? `${origin}${link}` : link;
}

export function buildTools(origin: string): ToolDef[] {
  return [
    {
      name: "whoami",
      title: "내 계정 확인",
      description: "지금 연결된 CRM 직원 계정(이름·부서·직책·역할)을 확인합니다.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      readOnly: true,
      run: async (_args, viewer) => {
        const u = await prisma.user.findUnique({
          where: { id: viewer.id },
          select: { id: true, name: true, email: true, department: true, position: true, role: true },
        });
        return u;
      },
    },
    {
      name: "get_my_stages",
      title: "내 담당 단계 보기",
      description:
        "내가 담당한 프로젝트 단계를 진행 중(active)·대기(pending)·완료(done)로 나눠 보여 줍니다. " +
        "각 항목에는 프로젝트 이름, 몇 단계인지, 단계 id(stageId), 내 진행률·최근 메모, 같은 단계의 다른 담당자 진행 상황이 들어 있습니다. " +
        "진행 저장·완료 처리 도구를 쓰기 전에 이 도구로 stageId를 확인하세요.",
      inputSchema: {
        type: "object",
        properties: {
          includeDone: { type: "boolean", description: "완료한 단계도 포함할지(기본 false)" },
        },
        additionalProperties: false,
      },
      readOnly: true,
      run: async (args, viewer) => {
        const r = await getAssigneeStages(viewer.id, stageViewer(viewer));
        const withLinks = <T extends { task: { id: string; folderUrl: string | null } }>(list: T[]) =>
          list.map((i) => ({
            ...i,
            task: { ...i.task, folderUrl: absolute(origin, i.task.folderUrl) },
            projectUrl: `${origin}/tasks/${i.task.id}`,
          }));
        return {
          user: r.user,
          pageUrl: `${origin}/stages/me`,
          active: withLinks(r.active),
          pending: withLinks(r.pending),
          ...(args.includeDone === true ? { done: withLinks(r.done) } : { doneCount: r.done.length }),
        };
      },
    },
    {
      name: "get_stage_overview",
      title: "프로젝트 단계 진행 현황",
      description:
        "단계가 있는 프로젝트 목록과 프로젝트마다 지금 몇 단계인지, 단계별 담당자와 진행률을 보여 줍니다. " +
        "볼 수 있는 프로젝트만 나옵니다(관리자는 전체, 그 밖에는 작성자·담당자·단계 담당자인 프로젝트).",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "프로젝트 이름에 들어간 글자로 거르기(선택)" },
          includeDone: { type: "boolean", description: "모든 단계가 끝난 프로젝트도 포함할지(기본 false)" },
        },
        additionalProperties: false,
      },
      readOnly: true,
      run: async (args, viewer) => {
        const q = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
        const list = await getStageOverview(stageViewer(viewer), args.includeDone === true);
        const filtered = q ? list.filter((p) => p.title.toLowerCase().includes(q)) : list;
        return {
          pageUrl: `${origin}/stages`,
          count: filtered.length,
          projects: filtered.map((p) => ({
            ...p,
            folderUrl: absolute(origin, p.folderUrl),
            projectUrl: `${origin}/tasks/${p.taskId}`,
          })),
        };
      },
    },
    {
      name: "get_project_stages",
      title: "프로젝트 단계 상세",
      description: "프로젝트 하나(taskId)의 단계 구성과 단계별 담당자 진행 상황을 보여 줍니다.",
      inputSchema: {
        type: "object",
        properties: { taskId: { type: "string", description: "프로젝트(업무) id" } },
        required: ["taskId"],
        additionalProperties: false,
      },
      readOnly: true,
      run: async (args, viewer) => {
        const taskId = str(args, "taskId");
        const r = await getTaskStages(taskId, stageViewer(viewer));
        return { ...r, projectUrl: `${origin}/tasks/${taskId}` };
      },
    },
    {
      name: "get_stage_progress_logs",
      title: "단계 진행 기록",
      description: "단계 하나(stageId)에 담당자들이 저장한 진행 메모·진행률 기록을 최근순으로 보여 줍니다(최대 100개).",
      inputSchema: {
        type: "object",
        properties: { stageId: { type: "string", description: "단계 id" } },
        required: ["stageId"],
        additionalProperties: false,
      },
      readOnly: true,
      run: async (args, viewer) => ({ logs: await getStageProgressLogs(str(args, "stageId"), stageViewer(viewer)) }),
    },
    {
      name: "save_my_stage_progress",
      title: "내 단계 진행 저장",
      description:
        "내가 맡은 진행 중 단계에 진행 메모와 진행률(0~100)을 저장합니다. 단계 상태는 바뀌지 않습니다. " +
        "완료 처리한 단계는 먼저 완료를 취소해야 저장할 수 있습니다.",
      inputSchema: {
        type: "object",
        properties: {
          stageId: { type: "string", description: "단계 id(get_my_stages에서 확인)" },
          note: { type: "string", description: "진행 내용(2000자 이내)" },
          progress: { type: "integer", minimum: 0, maximum: 100, description: "진행률(%)" },
        },
        required: ["stageId", "note", "progress"],
        additionalProperties: false,
      },
      readOnly: false,
      run: async (args, viewer) => {
        const stageId = str(args, "stageId");
        await saveMyStageProgress(stageId, stageViewer(viewer), args.note, args.progress);
        return { ok: true, message: "진행 내용을 저장했습니다." };
      },
    },
    {
      name: "set_my_stage_completed",
      title: "내 단계 완료 처리",
      description:
        "내가 맡은 진행 중 단계를 완료(completed=true)하거나 완료를 취소(completed=false)합니다. " +
        "단계 담당자 전원이 완료하면 다음 단계가 시작되고 다음 담당자에게 알림이 갑니다. 실행 전에 사용자에게 꼭 확인하세요.",
      inputSchema: {
        type: "object",
        properties: {
          stageId: { type: "string", description: "단계 id(get_my_stages에서 확인)" },
          completed: { type: "boolean", description: "true=완료, false=완료 취소" },
        },
        required: ["stageId", "completed"],
        additionalProperties: false,
      },
      readOnly: false,
      run: async (args, viewer) => {
        const stageId = str(args, "stageId");
        if (typeof args.completed !== "boolean") throw new ToolInputError("completed 값(true/false)이 필요합니다.");
        const r = await setMyStageCompleted(stageId, stageViewer(viewer), args.completed);
        return {
          ok: true,
          ...r,
          message: args.completed
            ? r.allDone
              ? "완료 처리했습니다. 프로젝트의 모든 단계가 끝났습니다."
              : r.stageAdvanced
                ? "완료 처리했습니다. 다음 단계가 시작되었습니다."
                : "완료 처리했습니다. 같은 단계의 다른 담당자가 완료하면 다음 단계로 넘어갑니다."
            : "완료를 취소했습니다.",
        };
      },
    },
    {
      name: "list_my_notifications",
      title: "내 알림 보기",
      description: "내 CRM 알림을 최근순으로 보여 줍니다(안 읽은 알림 먼저). 읽음 처리는 하지 않습니다.",
      inputSchema: {
        type: "object",
        properties: {
          unreadOnly: { type: "boolean", description: "안 읽은 알림만(기본 false)" },
          limit: { type: "integer", minimum: 1, maximum: 50, description: "개수(기본 20)" },
        },
        additionalProperties: false,
      },
      readOnly: true,
      run: async (args, viewer) => {
        const raw = Number(args.limit);
        const limit = Math.min(Math.max(Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 20, 1), 50);
        const [list, unread] = await Promise.all([
          prisma.notification.findMany({
            where: { userId: viewer.id, ...(args.unreadOnly === true ? { isRead: false } : {}) },
            orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
            take: limit,
            select: { id: true, type: true, message: true, link: true, isRead: true, createdAt: true },
          }),
          prisma.notification.count({ where: { userId: viewer.id, isRead: false } }),
        ]);
        return {
          unreadCount: unread,
          notifications: list.map((n) => ({
            id: n.id,
            type: n.type,
            message: n.message,
            url: absolute(origin, n.link),
            isRead: n.isRead,
            createdAt: n.createdAt.toISOString(),
          })),
        };
      },
    },
  ];
}

export function describeTools(tools: ToolDef[]) {
  return tools.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: {
      title: t.title,
      readOnlyHint: t.readOnly,
      destructiveHint: false,
      idempotentHint: t.readOnly,
      openWorldHint: false,
    },
  }));
}

export async function callTool(tools: ToolDef[], name: string, args: unknown, viewer: McpViewer) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return null;
  const input = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  try {
    const result = await tool.run(input, viewer);
    const structured = result && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>) : { result };
    return {
      content: [{ type: "text", text: JSON.stringify(result ?? null) }],
      structuredContent: structured,
    };
  } catch (e) {
    if (e instanceof StageError || e instanceof ToolInputError) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
    console.error(`[mcp] tool ${name}`, e);
    return { content: [{ type: "text", text: "CRM에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }], isError: true };
  }
}
