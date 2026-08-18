import "server-only";

import { addDays, format } from "date-fns";
import prisma from "@/lib/prisma";
import { createTaskWithNotifications } from "@/lib/tasks/create-task";
import {
  callAiByProvider,
  getClaudeApiKey,
  logClaudeEnvForVercel,
  maskApiKeyForLog,
  resolveProviderWithAvailableKeys,
  shouldFallbackGeminiToClaude,
  shouldRetryGeminiSecretaryWithClaude,
  CLAUDE_DEFAULT_MODEL,
  GEMINI_API_BASE,
  GEMINI_MODEL_FALLBACKS,
  type AIProvider,
  type ChatMessage,
} from "@/lib/ai/assist-client";
import { buildSecretaryDataContext } from "@/lib/ai-secretary/build-context";
import { getProductKnowledge } from "@/lib/ai-secretary/product-knowledge";
import { getSecretaryRolePrompt, isExecutiveLike } from "@/lib/ai-secretary/prompts";
import { calculateLeavePool } from "@/lib/leave/calculate-pool";
import { toKstYmd } from "@/lib/date-kst";
import { createActivityLog } from "@/lib/activity-log";
import { notifyScheduleInviteesAfterCreate } from "@/lib/schedules/notify-schedule-invitees";
import { filterScheduleInviteeIds } from "@/lib/schedule-team-access";
import { loadCsSchedulerUserIds } from "@/lib/schedule-team-access-db";

// ─── Tool definitions ────────────────────────────────────────────────────────

const SECRETARY_TOOLS = [
  {
    name: "create_schedule",
    description:
      "사용자의 캘린더에 새 일정을 등록합니다. 일정·스케줄 등록 요청이 오면 반드시 이 도구를 사용하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "일정 제목" },
        startTime: {
          type: "string",
          description: "시작 시간 (ISO 8601, 예: 2025-03-24T09:00:00+09:00)",
        },
        endTime: {
          type: "string",
          description: "종료 시간 (ISO 8601, 예: 2025-03-24T10:00:00+09:00)",
        },
        description: { type: "string", description: "일정 설명 (선택)" },
        isAllDay: { type: "boolean", description: "종일 일정 여부 (기본값: false)" },
        inviteeUserIds: {
          type: "array",
          items: { type: "string" },
          description:
            "함께할 직원의 User ID 배열. 시스템 참고 데이터 '직원 연락처 목록'에 표시된 직원ID 값을 사용. 있으면 해당 사용자에게 일정 초대·알림·채팅이 갑니다.",
        },
        inviteeNames: {
          type: "array",
          items: { type: "string" },
          description:
            "초대할 직원 이름 배열(ID를 모를 때). DB에서 이름이 정확히 일치하는 사람이 한 명일 때만 초대됩니다.",
        },
      },
      required: ["title", "startTime", "endTime"],
    },
  },
  {
    name: "create_task",
    description:
      "새 업무(Task)를 생성합니다. 업무·할 일 생성 요청이 오면 반드시 이 도구를 사용하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "업무 제목" },
        description: { type: "string", description: "업무 설명 (선택)" },
        dueDate: {
          type: "string",
          description: "마감일 (YYYY-MM-DD, 예: 2025-03-24)",
        },
      },
      required: ["title", "dueDate"],
    },
  },
  {
    name: "create_leave",
    description:
      "본인 명의로 휴가(연차·반차·쪼개기)를 신청합니다. 연차/반차/휴가 신청 요청이 오면 반드시 이 도구를 사용하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: [
            "ANNUAL",
            "HALF_AM",
            "HALF_PM",
            "QUARTER_AM",
            "QUARTER_PM",
            "SICK_PAID",
            "SICK_UNPAID",
          ],
          description:
            "ANNUAL=연차(기간), HALF_AM/PM=반차, QUARTER_AM/PM=반반차, SICK_PAID=유급병가, SICK_UNPAID=무급병가(연차 차감 없음)",
        },
        startDate: {
          type: "string",
          description: "시작일 (YYYY-MM-DD 또는 ISO 날짜)",
        },
        endDate: {
          type: "string",
          description: "종료일 (YYYY-MM-DD 또는 ISO 날짜, 반차는 보통 시작일과 동일)",
        },
        reason: { type: "string", description: "사유 (선택)" },
      },
      required: ["type", "startDate", "endDate"],
    },
  },
  {
    name: "create_project",
    description:
      "팀 공유 업무(Projects / Task)를 새로 만듭니다. 사용자가 '프로젝트 만들어줘', 'OO 프로젝트 추가' 등으로 요청하면 이 도구를 사용하세요. (브랜드 견적 프로젝트 테이블과는 별개입니다.)",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "프로젝트(업무) 제목" },
        description: { type: "string", description: "설명 (선택)" },
        dueDate: {
          type: "string",
          description: "마감일 YYYY-MM-DD (없으면 오늘 기준 7일 후)",
        },
        status: {
          type: "string",
          enum: ["준비중", "진행중", "완료"],
          description: "준비중=Todo, 진행중=In progress, 완료=Done",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_project",
    description:
      "기존 프로젝트(업무 Task)를 수정합니다. 마감일 변경·제목 변경·진행 상태 변경 요청 시 projectId(업무 ID)를 넣고 변경할 필드만 지정하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        projectId: { type: "string", description: "수정할 업무(Task)의 ID" },
        title: { type: "string", description: "새 제목 (선택)" },
        dueDate: { type: "string", description: "새 마감일 YYYY-MM-DD (선택)" },
        status: {
          type: "string",
          enum: ["준비중", "진행중", "완료"],
          description: "상태 (선택)",
        },
      },
      required: ["projectId"],
    },
  },
] as const;

function mapSecretaryProjectStatus(
  raw: string | undefined
): "TODO" | "IN_PROGRESS" | "DONE" | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const s = raw.trim();
  const map: Record<string, "TODO" | "IN_PROGRESS" | "DONE"> = {
    준비중: "TODO",
    진행중: "IN_PROGRESS",
    완료: "DONE",
    TODO: "TODO",
    IN_PROGRESS: "IN_PROGRESS",
    DONE: "DONE",
  };
  return map[s];
}

const LEAVE_TYPE_DAY_UNITS: Record<string, number> = {
  ANNUAL: 1,
  HALF_AM: 0.5,
  HALF_PM: 0.5,
  QUARTER_AM: 0.25,
  QUARTER_PM: 0.25,
};

function isSickLeaveTypeSecretary(t: string): boolean {
  return t === "SICK_PAID" || t === "SICK_UNPAID";
}

/** 첫 사용자 메시지에 포함 시 도구 호출을 강제(ANY / tool_choice any) */
const SECRETARY_ACTION_KEYWORDS = [
  "일정",
  "스케줄",
  "회의",
  "약속",
  "캘린더",
  "등록해",
  "추가해",
  "잡아줘",
  "잡아 줘",
  "업무",
  "태스크",
  "task",
  "할 일",
  "할일",
  "생성해",
  "만들어",
  "연차",
  "반차",
  "휴가",
  "근태",
  "연차 신청",
  "휴가 신청",
  "프로젝트",
  "마감일",
  "마감",
] as const;

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    if (name === "create_schedule") {
      const {
        title,
        startTime,
        endTime,
        description,
        isAllDay,
        inviteeUserIds: rawInviteeIds,
        inviteeNames: rawInviteeNames,
      } = input as {
        title: string;
        startTime: string;
        endTime: string;
        description?: string;
        isAllDay?: boolean;
        inviteeUserIds?: string[];
        inviteeNames?: string[];
      };

      const fromIds = Array.isArray(rawInviteeIds)
        ? rawInviteeIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      const invitees = new Set<string>(fromIds);
      const names = Array.isArray(rawInviteeNames) ? rawInviteeNames : [];
      for (const n of names) {
        if (typeof n !== "string" || !n.trim()) continue;
        const found = await prisma.user.findMany({
          where: { name: n.trim() },
          select: { id: true },
        });
        if (found.length === 1) invitees.add(found[0].id);
      }
      invitees.delete(userId);
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, department: true },
      });
      const csUserIds = await loadCsSchedulerUserIds();
      const inviteeList = me
        ? filterScheduleInviteeIds(me, [...invitees], csUserIds)
        : [];

      const schedule = await prisma.schedule.create({
        data: {
          title,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          description: description ?? null,
          isAllDay: isAllDay ?? false,
          userId,
          scope: "PERSONAL",
        },
      });

      await createActivityLog(userId, "SCHEDULE_CREATED", schedule.title, undefined, {
        timestamp: schedule.startTime,
      });

      if (inviteeList.length > 0) {
        await prisma.scheduleInvite.createMany({
          data: inviteeList.map((toUserId) => ({
            scheduleId: schedule.id,
            fromUserId: userId,
            toUserId,
            status: "PENDING" as const,
          })),
          skipDuplicates: true,
        });
        await notifyScheduleInviteesAfterCreate({
          organizerId: userId,
          inviteeUserIds: inviteeList,
          scheduleTitle: schedule.title,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          isAllDay: schedule.isAllDay,
        });
      }

      const fmt = (d: Date) =>
        new Intl.DateTimeFormat("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(d);
      let out = `✅ 일정이 등록되었습니다.\n- 제목: ${schedule.title}\n- 시작: ${fmt(schedule.startTime)}\n- 종료: ${fmt(schedule.endTime)}`;
      if (inviteeList.length > 0) {
        out += `\n- 참석자 ${inviteeList.length}명에게 알림·채팅을 보냈습니다.`;
      }
      return out;
    }

    if (name === "create_task") {
      const { title, description, dueDate } = input as {
        title: string;
        description?: string;
        dueDate: string;
      };
      const task = await prisma.task.create({
        data: {
          title,
          description: description ?? null,
          dueDate: new Date(`${dueDate}T00:00:00+09:00`),
          assignedToId: userId,
          createdById: userId,
          status: "TODO",
          isCompleted: false,
          scope: "PERSONAL",
          creationSource: "UNKNOWN",
          assignees: {
            create: { userId },
          },
        },
      });
      return `✅ 업무가 생성되었습니다.\n- 제목: ${task.title}\n- 마감: ${dueDate}`;
    }

    if (name === "create_leave") {
      const { type, startDate: startRaw, endDate: endRaw, reason } = input as {
        type: string;
        startDate: string;
        endDate: string;
        reason?: string;
      };
      const allowed = new Set([
        "ANNUAL",
        "HALF_AM",
        "HALF_PM",
        "QUARTER_AM",
        "QUARTER_PM",
        "SICK_PAID",
        "SICK_UNPAID",
      ]);
      if (!allowed.has(type)) {
        throw new Error(`지원하지 않는 휴가 유형: ${type}`);
      }

      const start = new Date(startRaw);
      const end = new Date(endRaw);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error("날짜 형식이 올바르지 않습니다.");
      }
      if (end < start) {
        throw new Error("종료일은 시작일 이후여야 합니다.");
      }

      const pool = await calculateLeavePool(userId, new Date());
      const remaining = pool.available;

      let days = 0;
      if (type === "ANNUAL" || isSickLeaveTypeSecretary(type)) {
        const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        days = Math.min(diff, isSickLeaveTypeSecretary(type) ? 365 : 30);
      } else {
        days = LEAVE_TYPE_DAY_UNITS[type] ?? 0;
      }

      if (!isSickLeaveTypeSecretary(type) && days > remaining) {
        throw new Error(`연차 잔여일(${remaining.toFixed(1)}일)이 부족합니다.`);
      }

      const leave = await prisma.leaveRequest.create({
        data: {
          userId,
          type: type as
            | "ANNUAL"
            | "HALF_AM"
            | "HALF_PM"
            | "QUARTER_AM"
            | "QUARTER_PM"
            | "SICK_PAID"
            | "SICK_UNPAID",
          startDate: start,
          endDate: end,
          reason: reason?.trim() ? reason.trim() : null,
        },
      });

      const startStr = toKstYmd(leave.startDate);
      const endStr = toKstYmd(leave.endDate);

      return `✅ 휴가 신청이 등록되었습니다.\n- 유형: ${type}\n- 기간: ${startStr} ~ ${endStr}`;
    }

    if (name === "create_project") {
      const { title, description, dueDate: dueRaw, status: stRaw } = input as {
        title: string;
        description?: string;
        dueDate?: string;
        status?: string;
      };
      if (!title || !String(title).trim()) {
        return "도구 실행 실패 (create_project): 제목이 필요합니다.";
      }
      let dueIso: string;
      if (dueRaw && String(dueRaw).trim()) {
        const t = String(dueRaw).trim();
        const ymd = t.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
          dueIso = `${ymd}T12:00:00+09:00`;
        } else {
          const dt = new Date(t);
          dueIso = Number.isNaN(dt.getTime())
            ? `${format(addDays(new Date(), 7), "yyyy-MM-dd")}T12:00:00+09:00`
            : dt.toISOString();
        }
      } else {
        dueIso = `${format(addDays(new Date(), 7), "yyyy-MM-dd")}T12:00:00+09:00`;
      }
      const status = mapSecretaryProjectStatus(stRaw) ?? "TODO";
      const task = await createTaskWithNotifications({
        createdById: userId,
        scope: "TEAM",
        data: {
          title: String(title).trim(),
          description: description && String(description).trim() ? String(description).trim() : null,
          dueDate: dueIso,
          status,
          assigneeIds: [userId],
          creationSource: "UNKNOWN",
        },
      });
      const dueLabel = task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "미정";
      return `✅ 프로젝트(업무)가 생성되었습니다.\n- 제목: ${task.title}\n- ID: ${task.id}\n- 마감: ${dueLabel}`;
    }

    if (name === "update_project") {
      const { projectId, title, dueDate: dueRaw, status: stRaw } = input as {
        projectId: string;
        title?: string;
        dueDate?: string;
        status?: string;
      };
      if (!projectId || !String(projectId).trim()) {
        return "도구 실행 실패 (update_project): projectId가 필요합니다.";
      }
      const id = String(projectId).trim();
      const existing = await prisma.task.findFirst({
        where: {
          id,
          deletedAt: null,
          OR: [
            { assignedToId: userId },
            { createdById: userId },
            { assignees: { some: { userId } } },
          ],
        },
      });
      if (!existing) {
        return "도구 실행 실패 (update_project): 해당 업무를 찾을 수 없거나 수정 권한이 없습니다.";
      }
      const data: {
        title?: string;
        dueDate?: Date;
        status?: "TODO" | "IN_PROGRESS" | "DONE";
        isCompleted?: boolean;
      } = {};
      if (title !== undefined && String(title).trim()) {
        data.title = String(title).trim();
      }
      if (dueRaw !== undefined && String(dueRaw).trim()) {
        const d = String(dueRaw).trim().slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          data.dueDate = new Date(`${d}T12:00:00+09:00`);
        }
      }
      const mapped = mapSecretaryProjectStatus(stRaw);
      if (mapped) {
        data.status = mapped;
        if (mapped === "DONE") data.isCompleted = true;
        if (mapped !== "DONE" && stRaw !== undefined) data.isCompleted = false;
      }
      if (
        data.title === undefined &&
        data.dueDate === undefined &&
        data.status === undefined &&
        data.isCompleted === undefined
      ) {
        return "변경할 내용이 없습니다. title, dueDate, status 중 하나 이상을 지정하세요.";
      }
      await prisma.task.update({ where: { id: existing.id }, data });
      const parts: string[] = [`✅ 프로젝트(업무)가 수정되었습니다.`, `- ID: ${existing.id}`];
      if (data.title !== undefined) parts.push(`- 제목: ${data.title}`);
      if (data.dueDate !== undefined) parts.push(`- 마감: ${data.dueDate.toISOString().slice(0, 10)}`);
      if (data.status !== undefined) parts.push(`- 상태: ${data.status}`);
      return parts.join("\n");
    }

    return `알 수 없는 도구: ${name}`;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error("[AI secretary] tool execution failed", {
      tool: name,
      reason,
      stack: e instanceof Error ? e.stack : undefined,
    });
    return `도구 실행 실패 (${name}): ${reason}`;
  }
}

// ─── Gemini: 네이티브 functionCall + 텍스트/JSON 의사 호출 복구 (Claude와 분리) ─

const SECRETARY_TOOL_NAMES = new Set<string>(SECRETARY_TOOLS.map((t) => t.name));

type GeminiExtractedCall = { name: string; args: Record<string, unknown> };

function normalizeGeminiFunctionCallArgs(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return {};
    try {
      const j = JSON.parse(s) as unknown;
      if (j && typeof j === "object" && !Array.isArray(j)) return j as Record<string, unknown>;
    } catch {
      return {};
    }
    return {};
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  return {};
}

function partToGeminiFunctionCall(part: unknown): GeminiExtractedCall | null {
  if (!part || typeof part !== "object") return null;
  const p = part as Record<string, unknown>;
  const fc = (p.functionCall ?? p.function_call) as Record<string, unknown> | undefined;
  if (!fc || typeof fc !== "object") return null;
  const name = fc.name;
  if (typeof name !== "string" || !SECRETARY_TOOL_NAMES.has(name)) return null;
  const args = normalizeGeminiFunctionCallArgs(fc.args);
  return { name, args };
}

function collectGeminiFunctionCallsFromParts(parts: unknown[]): GeminiExtractedCall[] {
  const out: GeminiExtractedCall[] = [];
  for (const part of parts) {
    const c = partToGeminiFunctionCall(part);
    if (c) out.push(c);
  }
  return out;
}

function extractBalancedParenArgs(s: string, openParenIdx: number): string | null {
  if (s[openParenIdx] !== "(") return null;
  let depth = 0;
  for (let i = openParenIdx; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return s.slice(openParenIdx + 1, i);
    }
  }
  return null;
}

/** Python 스타일 키=값 인자 (일부 Gemini가 텍스트로 출력) */
function parsePythonKeywordArgs(argStr: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let i = 0;
  const skipWs = () => {
    while (i < argStr.length && /\s/.test(argStr[i]!)) i++;
  };
  while (i < argStr.length) {
    skipWs();
    const slice = argStr.slice(i);
    const km = /^(\w+)\s*=/.exec(slice);
    if (!km) break;
    const key = km[1]!;
    i += km[0].length;
    skipWs();
    if (i >= argStr.length) break;
    const c = argStr[i]!;
    if (c === "'" || c === '"') {
      const quote = c;
      i++;
      let val = "";
      while (i < argStr.length) {
        if (argStr[i] === "\\" && i + 1 < argStr.length) {
          val += argStr[i + 1]!;
          i += 2;
          continue;
        }
        if (argStr[i] === quote) {
          i++;
          break;
        }
        val += argStr[i]!;
        i++;
      }
      out[key] = val;
    } else if (c === "[") {
      let depth = 0;
      const start = i;
      for (; i < argStr.length; i++) {
        if (argStr[i] === "[") depth++;
        else if (argStr[i] === "]") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
      }
      const arrStr = argStr.slice(start, i);
      try {
        out[key] = JSON.parse(arrStr.replace(/'/g, '"')) as unknown;
      } catch {
        out[key] = arrStr;
      }
    } else {
      const rest = argStr.slice(i);
      const tm = /^([^,)]+)/.exec(rest);
      const rawVal = (tm?.[1] ?? "").trim();
      i += rawVal.length;
      if (rawVal === "True") out[key] = true;
      else if (rawVal === "False") out[key] = false;
      else if (/^-?\d/.test(rawVal)) out[key] = Number(rawVal);
      else out[key] = rawVal;
    }
    skipWs();
    if (argStr[i] === ",") i++;
  }
  return out;
}

function unwrapOuterPrint(s: string): string {
  let u = s.trim();
  const pm = /^print\s*\(\s*([\s\S]*)\s*\)\s*$/i.exec(u);
  if (pm) u = pm[1]!.trim();
  return u;
}

function extractToolCallFromPythonish(code: string): GeminiExtractedCall | null {
  const re =
    /(?:default_api\.)?(create_schedule|create_task|create_leave|create_project|update_project)\s*\(/gi;
  const m = re.exec(code);
  if (!m) return null;
  const name = m[1]!;
  const openIdx = m.index + m[0].length - 1;
  const inner = extractBalancedParenArgs(code, openIdx);
  if (inner === null) return null;
  const args = parsePythonKeywordArgs(inner);
  return { name, args };
}

function looksLikeGeminiFakeToolText(s: string): boolean {
  return /tool_code|default_api\.create_|create_schedule\s*\(|create_task\s*\(|create_leave\s*\(|create_project\s*\(|update_project\s*\(|"tool_code"\s*:/i.test(
    s
  );
}

/** 모델이 도구 대신 JSON/파이썬 형태 텍스트를 줄 때 복구 */
function parseGeminiToolCallsFromAssistantText(text: string): GeminiExtractedCall[] {
  const raw = text.trim();
  if (!raw) return [];

  let t = raw.replace(/^```(?:json|python)?\s*/i, "").replace(/\s*```$/i, "").trim();

  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      if (typeof j.tool_code === "string") {
        const inner = unwrapOuterPrint(j.tool_code);
        const c = extractToolCallFromPythonish(inner);
        if (c) return [c];
      }
      if (typeof j.name === "string" && SECRETARY_TOOL_NAMES.has(j.name)) {
        const args = normalizeGeminiFunctionCallArgs(j.arguments ?? j.args ?? j.parameters);
        return [{ name: j.name, args }];
      }
      if (Array.isArray(j.functionCalls)) {
        const out: GeminiExtractedCall[] = [];
        for (const item of j.functionCalls) {
          if (!item || typeof item !== "object") continue;
          const it = item as { name?: string; args?: unknown };
          if (typeof it.name === "string" && SECRETARY_TOOL_NAMES.has(it.name)) {
            out.push({ name: it.name, args: normalizeGeminiFunctionCallArgs(it.args) });
          }
        }
        if (out.length) return out;
      }
    } catch {
      /* fall through: 전체를 파이썬 형태로 재시도 */
    }
  }

  const c = extractToolCallFromPythonish(unwrapOuterPrint(t));
  return c ? [c] : [];
}

// ─── Anthropic tool-use loop ─────────────────────────────────────────────────

type AnthropicContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

type AnthropicMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "user"; content: { type: "tool_result"; tool_use_id: string; content: string }[] }
  | { role: "assistant"; content: AnthropicContent[] };

async function callAnthropicWithToolLoop(
  apiKey: string,
  systemPrompt: string,
  messages: AnthropicMessage[],
  userId: string
): Promise<string> {
  const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
  const model = process.env.CLAUDE_MODEL?.trim() || CLAUDE_DEFAULT_MODEL;
  const maxTokens = Math.max(1, Number(process.env.CLAUDE_MAX_TOKENS) || 1000);
  const headerKey = (process.env.CLAUDE_API_KEY ?? "").trim() || apiKey;

  const currentMessages = [...messages];
  const MAX_LOOPS = 5;

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    // 첫 번째 루프에서 사용자 메시지에 일정/업무 관련 키워드가 있으면 tool_choice: "any"로 강제.
    // 일반 대화(인사, 질문 등)는 "auto"로 유지.
    let toolChoice: { type: string } = { type: "auto" };
    if (loop === 0) {
      const lastMsg = [...currentMessages].reverse().find((m) => m.role === "user");
      const msgText = typeof lastMsg?.content === "string" ? lastMsg.content : "";
      if (SECRETARY_ACTION_KEYWORDS.some((k) => msgText.includes(k))) {
        toolChoice = { type: "any" };
      }
    }
    const body = {
      model,
      max_tokens: maxTokens,
      temperature: 0.3,
      system: systemPrompt,
      tools: SECRETARY_TOOLS,
      tool_choice: toolChoice,
      messages: currentMessages,
    };

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": headerKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const raw = await res.text();
    if (!res.ok) {
      throw new Error(`Claude API 오류 (${res.status}): ${raw.slice(0, 300)}`);
    }

    const data = JSON.parse(raw) as {
      stop_reason: string;
      content: AnthropicContent[];
    };

    if (data.stop_reason !== "tool_use") {
      // 최종 텍스트 응답
      const text = data.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n\n")
        .trim();
      return text || "응답을 생성하지 못했습니다.";
    }

    // tool_use 처리
    const toolUseBlocks = data.content.filter(
      (c): c is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        c.type === "tool_use"
    );

    // assistant 메시지 추가
    currentMessages.push({ role: "assistant", content: data.content });

    // 도구 실행 후 tool_result 메시지 추가
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => ({
        type: "tool_result" as const,
        tool_use_id: block.id,
        content: await executeTool(block.name, block.input, userId),
      }))
    );
    currentMessages.push({ role: "user", content: toolResults });
  }

  return "요청을 처리하지 못했습니다.";
}

/** Gemini generateContent + function calling (일정 등록·업무 생성 — Claude와 동일 도구) */
async function callGeminiWithToolLoop(
  apiKey: string,
  systemPrompt: string,
  history: { role: string; content: string }[],
  userId: string
): Promise<string> {
  const declarations = SECRETARY_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema as unknown as Record<string, unknown>,
  }));

  const contents: { role: "user" | "model"; parts: Record<string, unknown>[] }[] = [];
  for (const m of history) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const role = m.role === "user" ? ("user" as const) : ("model" as const);
    const text = m.content ?? "";
    if (role === "model" && !text.trim()) continue;
    if (role === "user" && !text.trim()) continue;
    contents.push({ role, parts: [{ text }] });
  }

  const envModel = process.env.GEMINI_MODEL?.trim();
  const tryModels = envModel
    ? [envModel, ...GEMINI_MODEL_FALLBACKS.filter((mod) => mod !== envModel)]
    : [...GEMINI_MODEL_FALLBACKS];

  const MAX_LOOPS = 5;
  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    let toolChoiceMode = "AUTO";
    if (loop === 0) {
      const lastUser = [...history].reverse().find((m) => m.role === "user");
      const msgText = lastUser?.content ?? "";
      if (SECRETARY_ACTION_KEYWORDS.some((k) => msgText.includes(k))) {
        toolChoiceMode = "ANY";
      }
    }

    const maxOut = Math.max(256, Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 2048);
    const body: Record<string, unknown> = {
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: [{ functionDeclarations: declarations }],
      toolConfig: {
        functionCallingConfig: {
          mode: toolChoiceMode,
        },
      },
      generationConfig: {
        maxOutputTokens: maxOut,
        temperature: 0.3,
      },
    };

    type CandPart = {
      text?: string;
      functionCall?: { name?: string; args?: Record<string, unknown> };
    };
    type GeminiGenResponse = {
      candidates?: { content?: { parts?: CandPart[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    let data: GeminiGenResponse | null = null;
    let last404 = "";

    for (let mi = 0; mi < tryModels.length; mi++) {
      const model = tryModels[mi];
      const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      if (res.status === 404 && mi < tryModels.length - 1) {
        last404 = raw;
        continue;
      }
      if (!res.ok) {
        throw new Error(`Gemini API 오류 (${res.status}): ${raw.slice(0, 400)}`);
      }
      data = JSON.parse(raw) as GeminiGenResponse;
      break;
    }
    if (!data) {
      throw new Error(`Gemini 모델을 찾을 수 없습니다: ${last404.slice(0, 200)}`);
    }

    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini 요청 차단: ${data.promptFeedback.blockReason}`);
    }

    const cand = data.candidates?.[0];
    const partsRaw = (cand?.content?.parts ?? []) as unknown[];

    let functionCalls = collectGeminiFunctionCallsFromParts(partsRaw);

    const texts = partsRaw
      .map((p) => {
        if (!p || typeof p !== "object") return "";
        const t = (p as { text?: string }).text;
        return typeof t === "string" ? t : "";
      })
      .filter((s) => s.trim().length > 0);

    if (functionCalls.length === 0) {
      const combined = texts.join("\n\n").trim();
      if (combined && looksLikeGeminiFakeToolText(combined)) {
        const recovered = parseGeminiToolCallsFromAssistantText(combined);
        if (recovered.length > 0) {
          console.log("[AI secretary] Gemini: 텍스트/JSON에서 도구 호출 복구", {
            tools: recovered.map((c) => c.name),
          });
          functionCalls = recovered;
        }
      }
    }

    if (functionCalls.length > 0) {
      contents.push({
        role: "model",
        parts: functionCalls.map((fc) => ({
          functionCall: {
            name: fc.name,
            args: fc.args && typeof fc.args === "object" && !Array.isArray(fc.args) ? fc.args : {},
          },
        })),
      });

      const resultParts = await Promise.all(
        functionCalls.map(async (fc) => {
          const name = fc.name;
          const args =
            fc.args && typeof fc.args === "object" && !Array.isArray(fc.args)
              ? (fc.args as Record<string, unknown>)
              : {};
          const out = await executeTool(name, args, userId);
          return {
            functionResponse: {
              name,
              response: { result: out },
            },
          };
        })
      );

      contents.push({ role: "user", parts: resultParts });
      continue;
    }

    const joined = texts.join("\n\n").trim();
    if (joined) return joined;
    if (cand?.finishReason === "MAX_TOKENS") {
      return "응답이 길이 제한으로 잘렸습니다. 더 짧게 다시 요청해 주세요.";
    }
    return "응답을 생성하지 못했습니다.";
  }

  return "요청을 처리하지 못했습니다.";
}

export async function resolveAiProviderForUser(userId: string): Promise<AIProvider> {
  let userPreferred: AIProvider | null = null;
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferredAiProvider: true },
    });
    const p = (u as { preferredAiProvider?: string | null } | null)?.preferredAiProvider;
    if (p === "gemini" || p === "openai" || p === "notebook" || p === "claude") userPreferred = p;
  } catch {
    /* preferredAiProvider 없을 수 있음 */
  }
  /** 직원 기본: Gemini (null/미설정 시). 임원·관리자만 DB에 claude 등 저장 */
  return userPreferred ?? "gemini";
}

function validateDateKey(dateKey: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)");
  }
}

type KeyFlags = { gemini: boolean; openai: boolean; claude: boolean; notebook: boolean };

/** 요청 프로바이더에 필요한 API 키 존재 여부 (Gemini 503 등은 sendSecretaryMessage에서 Claude로 폴백) */
function assertKeysForProvider(provider: AIProvider, keys: KeyFlags): void {
  if (provider === "gemini" && !keys.gemini) throw new Error("GEMINI_API_KEY가 없습니다.");
  if (provider === "openai" && !keys.openai) throw new Error("OPENAI_API_KEY가 없습니다.");
  if (provider === "claude" && !keys.claude) {
    throw new Error("CLAUDE_API_KEY(또는 ANTHROPIC_API_KEY)가 없습니다.");
  }
  if (provider === "notebook" && !keys.notebook) throw new Error("NOTEBOOK_LLM_URL이 없습니다.");
}

/** Vercel 로그 길이 제한 대비 — 긴 system 프롬프트를 나눠 출력 */
function logAiSecretarySystemPrompt(systemContent: string, meta: { userId: string; role: string; dateKey: string }) {
  const tag = "[AI secretary] system prompt";
  const debugFull =
    process.env.DEBUG_AI_SECRETARY_SYSTEM === "1" || process.env.NODE_ENV === "development";

  const emailLike = /@|이메일:|email:/i.test(systemContent);
  console.log(`${tag} (meta)`, {
    ...meta,
    charLength: systemContent.length,
    contextLikelyHasEmailField: emailLike,
  });

  if (debugFull) {
    const chunkSize = 6000;
    if (systemContent.length <= chunkSize) {
      console.log(`${tag} (full)\n`, systemContent);
    } else {
      for (let i = 0; i < systemContent.length; i += chunkSize) {
        const part = Math.floor(i / chunkSize) + 1;
        const total = Math.ceil(systemContent.length / chunkSize);
        console.log(`${tag} (full part ${part}/${total})\n`, systemContent.slice(i, i + chunkSize));
      }
    }
  } else {
    console.log(`${tag} (preview 800자, 전체는 DEBUG_AI_SECRETARY_SYSTEM=1)\n`, systemContent.slice(0, 800));
  }
}

/**
 * assist/route.ts와 동일하게 callAiByProvider 사용 — DB 저장 포함
 */
export async function sendSecretaryMessage(params: {
  userId: string;
  role: string;
  dateKey: string;
  message: string;
  requestedProvider?: AIProvider | null;
}): Promise<{ reply: string }> {
  const { userId, role, dateKey, message, requestedProvider } = params;
  validateDateKey(dateKey);
  const trimmed = message.trim();
  if (!trimmed) throw new Error("메시지가 비어 있습니다.");

  /** `requestedProvider`가 있으면(테스트 등) DB보다 우선. 일반 요청은 DB·직원 기본 gemini */
  const providerRaw = requestedProvider ?? (await resolveAiProviderForUser(userId));

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const claudeKey = getClaudeApiKey();
  const notebookUrl = process.env.NOTEBOOK_LLM_URL?.trim();
  const keyFlags: KeyFlags = {
    gemini: !!geminiKey,
    openai: !!openAiKey,
    claude: !!claudeKey,
    notebook: !!notebookUrl,
  };

  const provider: AIProvider =
    requestedProvider != null
      ? providerRaw
      : resolveProviderWithAvailableKeys(providerRaw, keyFlags);

  assertKeysForProvider(provider, keyFlags);

  console.log("[AI secretary] provider resolved (Vercel Functions 로그)", {
    providerRaw,
    provider,
    claudeKeyPresent: !!claudeKey,
    claudeKeyMasked: maskApiKeyForLog(claudeKey),
  });
  if (provider === "claude") {
    logClaudeEnvForVercel("sendSecretaryMessage:using_claude");
  }

  const conversation = await prisma.$transaction(async (tx) => {
    const conv = await tx.aiConversation.upsert({
      where: { userId_dateKey: { userId, dateKey } },
      create: { userId, dateKey },
      update: {},
    });
    const maxRow = await tx.aiConversationMessage.aggregate({
      where: { conversationId: conv.id },
      _max: { orderIndex: true },
    });
    const nextOrder = (maxRow._max.orderIndex ?? -1) + 1;
    await tx.aiConversationMessage.create({
      data: {
        conversationId: conv.id,
        role: "user",
        content: trimmed,
        orderIndex: nextOrder,
      },
    });
    return conv;
  });

  const history = await prisma.aiConversationMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { orderIndex: "asc" },
  });

  const ctx = await buildSecretaryDataContext({ userId, role, dateKey });
  const rolePrompt = getSecretaryRolePrompt(role);
  const instructionSuffix = isExecutiveLike(role)
    ? "답변은 한국어로 하세요. 위 참고 데이터에 포함된 직원·연락처·업무 정보는 사용자가 물으면 제공하세요. 허용된 범위의 정보 제공을 거부하지 마세요."
    : "답변은 한국어로 하세요. 일정 등록·업무 생성·휴가(연차/반차) 신청·프로젝트(팀 업무) 생성/수정 요청은 반드시 도구를 사용해 즉시 실행하세요. 권한이 없는 정보(연락처·재무 등)만 거부하세요.";
  const productKb = getProductKnowledge().trim();
  const kbBlock = productKb
    ? `【제품 지식 참고 (docs/PRODUCT_KNOWLEDGE.md)】\n아래는 앱 사용법·개념 요약입니다. 기능 설명·메뉴 경로·제한에 대한 질문이면 우선 참고하세요. 아래 내용과 실시간 DB·도구 결과가 다르면 DB·도구 결과를 우선합니다.\n\n${productKb}\n\n---\n\n`
    : "";
  const systemContent = `${kbBlock}${rolePrompt}\n\n${ctx}\n\n${instructionSuffix}`;

  logAiSecretarySystemPrompt(systemContent, { userId, role, dateKey });

  console.log("provider:", provider);
  console.log("API KEY exists:", !!process.env.CLAUDE_API_KEY);

  let reply: string;
  if (provider === "claude") {
    const toolMessages: AnthropicMessage[] = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    reply = await callAnthropicWithToolLoop(
      getClaudeApiKey(),
      systemContent,
      toolMessages,
      userId
    );
  } else if (provider === "gemini") {
    const gKey = geminiKey!;
    const flatHistory = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));
    const toolMessagesAnthropic: AnthropicMessage[] = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    let cameFromGeminiOnly = true;
    try {
      reply = await callGeminiWithToolLoop(gKey, systemContent, flatHistory, userId);
    } catch (e) {
      cameFromGeminiOnly = false;
      if (!shouldFallbackGeminiToClaude(e)) throw e;
      if (!claudeKey) throw e;
      console.warn("[AI secretary] Gemini 요청 실패(503·429·네트워크 등); Claude 폴백", {
        err: e instanceof Error ? e.message : String(e),
      });
      try {
        reply = await callAnthropicWithToolLoop(
          getClaudeApiKey(),
          systemContent,
          toolMessagesAnthropic,
          userId
        );
      } catch (e2) {
        console.error("[AI secretary] Claude 폴백 실패", e2);
        throw new Error(
          "지금은 AI 응답을 생성할 수 없습니다. 잠시 후 다시 시도해 주세요."
        );
      }
    }
    if (cameFromGeminiOnly && shouldRetryGeminiSecretaryWithClaude(reply) && claudeKey) {
      console.warn("[AI secretary] Gemini 무응답/실패 문구만 반환; Claude 자동 재시도", {
        replyLength: reply.length,
        replyPreview: reply.slice(0, 160),
      });
      try {
        reply = await callAnthropicWithToolLoop(
          getClaudeApiKey(),
          systemContent,
          toolMessagesAnthropic,
          userId
        );
      } catch (e2) {
        console.error("[AI secretary] Claude 재시도 실패 (Gemini 무응답 후)", e2);
        throw new Error(
          "지금은 AI 응답을 생성할 수 없습니다. 잠시 후 다시 시도해 주세요."
        );
      }
    }
  } else {
    const chatMessages: ChatMessage[] = [{ role: "system", content: systemContent }];
    for (const m of history) {
      if (m.role === "user" || m.role === "assistant") {
        chatMessages.push({ role: m.role as "user" | "assistant", content: m.content });
      }
    }
    reply = await callAiByProvider(provider, chatMessages);
  }

  await prisma.$transaction(async (tx) => {
    const maxRow = await tx.aiConversationMessage.aggregate({
      where: { conversationId: conversation.id },
      _max: { orderIndex: true },
    });
    const nextOrder = (maxRow._max.orderIndex ?? -1) + 1;
    await tx.aiConversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: reply,
        orderIndex: nextOrder,
      },
    });
    await tx.aiConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
  });

  return { reply };
}
