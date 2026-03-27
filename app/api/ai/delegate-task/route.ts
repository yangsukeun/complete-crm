import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { createTaskWithNotifications, jsonSerializeCreatedTask } from "@/lib/tasks/create-task";
import {
  type AIProvider,
  type ChatMessage,
  callAiByProvider,
  getClaudeApiKey,
  resolveProviderWithAvailableKeys,
} from "@/lib/ai/assist-client";
import { todayYmdKst } from "@/lib/date-kst";

export const runtime = "nodejs";

const CONFIDENCE_MIN = 0.7;

const confirmBodySchema = z.object({
  confirm: z.literal(true),
  assigneeUserId: z.string().min(1),
  title: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const textBodySchema = z.object({
  text: z.string().min(1),
  confirm: z.undefined().optional(),
});

function parseJsonFromAiText(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonStr = fence ? fence[1].trim() : trimmed;
  return JSON.parse(jsonStr);
}

const aiResultSchema = z.object({
  assigneeUserId: z.string().nullable().optional(),
  title: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  confidence: z.number().min(0).max(1),
});

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const role = String(session.user.role ?? "").toUpperCase();
    if (role !== "EXECUTIVE" && role !== "ADMIN") {
      return NextResponse.json({ error: "대표·관리자만 사용할 수 있습니다." }, { status: 403 });
    }

    const scope = await getServerWorkspaceScopeFromRequest(req);
    if (scope !== "TEAM") {
      return NextResponse.json(
        { error: "회사 모드(팀 워크스페이스)에서만 프로젝트 지시를 등록할 수 있습니다." },
        { status: 400 }
      );
    }

    const body = await req.json();

    if (body?.confirm === true) {
      const parsed = confirmBodySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "확인 값이 올바르지 않습니다.", details: parsed.error.flatten() },
          { status: 400 }
        );
      }
      const { assigneeUserId, title, dueDate } = parsed.data;

      const assignee = await prisma.user.findUnique({
        where: { id: assigneeUserId },
        select: { id: true, name: true, role: true },
      });
      if (!assignee || (assignee.role !== "USER" && assignee.role !== "TEAM_LEAD")) {
        return NextResponse.json(
          { error: "담당자를 찾을 수 없거나 배정할 수 없는 계정입니다." },
          { status: 400 }
        );
      }

      const task = await createTaskWithNotifications({
        createdById: session.user.id,
        scope: "TEAM",
        data: {
          title: title.trim(),
          description: null,
          dueDate,
          assignedToId: assigneeUserId,
        },
      });

      return NextResponse.json({
        created: true,
        task: jsonSerializeCreatedTask(task),
        assigneeName: assignee.name,
      });
    }

    const textParsed = textBodySchema.safeParse(body);
    if (!textParsed.success) {
      return NextResponse.json(
        { error: "입력이 올바르지 않습니다.", details: textParsed.error.flatten() },
        { status: 400 }
      );
    }
    const userText = textParsed.data.text.trim();

    const employees = await prisma.user.findMany({
      where: {
        role: { in: ["USER", "TEAM_LEAD"] },
      },
      select: { id: true, name: true, department: true, position: true, email: true },
      orderBy: { name: "asc" },
    });

    if (employees.length === 0) {
      return NextResponse.json({ error: "배정 가능한 직원이 없습니다." }, { status: 400 });
    }

    const employeeJson = JSON.stringify(
      employees.map((e) => ({
        id: e.id,
        name: e.name,
        department: e.department,
        position: e.position,
      }))
    );

    const todayKst = todayYmdKst();

    let userPreferred: AIProvider | null = null;
    try {
      const u = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { preferredAiProvider: true },
      });
      const p = (u as { preferredAiProvider?: string | null } | null)?.preferredAiProvider;
      if (p === "gemini" || p === "openai" || p === "notebook" || p === "claude") userPreferred = p;
    } catch {
      // ignore
    }

    const providerRaw: AIProvider =
      (typeof body.provider === "string" &&
      (body.provider === "gemini" ||
        body.provider === "openai" ||
        body.provider === "notebook" ||
        body.provider === "claude")
        ? body.provider
        : null) ?? userPreferred ?? "gemini";

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const openAiKey = process.env.OPENAI_API_KEY?.trim();
    const claudeKey = getClaudeApiKey();
    const notebookUrl = process.env.NOTEBOOK_LLM_URL?.trim();

    const provider = resolveProviderWithAvailableKeys(providerRaw, {
      gemini: !!geminiKey,
      openai: !!openAiKey,
      claude: !!claudeKey,
      notebook: !!notebookUrl,
    });

    if (provider === "gemini" && !geminiKey) {
      return NextResponse.json(
        { error: "Gemini를 사용하려면 .env에 GEMINI_API_KEY를 설정하세요." },
        { status: 503 }
      );
    }
    if (provider === "openai" && !openAiKey) {
      return NextResponse.json(
        { error: "GPT를 사용하려면 .env에 OPENAI_API_KEY를 설정하세요." },
        { status: 503 }
      );
    }
    if (provider === "claude" && !claudeKey) {
      return NextResponse.json(
        { error: "Claude를 사용하려면 .env에 CLAUDE_API_KEY(또는 ANTHROPIC_API_KEY)를 설정하세요." },
        { status: 503 }
      );
    }
    if (provider === "notebook" && !notebookUrl) {
      return NextResponse.json(
        { error: "노트북 LLM을 사용하려면 .env에 NOTEBOOK_LLM_URL을 설정하세요." },
        { status: 503 }
      );
    }

    const systemPrompt = `당신은 회사 내부 프로젝트 배정 도우미입니다. 사용자의 한국어 지시문을 분석하여 JSON만 출력합니다.
규칙:
- 오늘 날짜(KST, YYYY-MM-DD): ${todayKst}
- 마감일(dueDate)은 반드시 YYYY-MM-DD 형식이어야 하며, "내일"이면 KST 기준 오늘 다음 날, "금요일" 등은 그에 맞는 날짜로 계산합니다.
- assigneeUserId는 아래 직원 목록의 id 중 정확히 하나여야 합니다. 호칭(김대리 등)으로 이름을 추론하면 됩니다. 확실하지 않으면 null로 두고 confidence를 낮춥니다.
- title은 프로젝트 제목 한 줄로 간결하게 작성합니다.
- confidence는 0~1 사이 실수로, 담당자·프로젝트 내용·마감일이 모두 명확하면 0.9 이상, 하나라도 애매하면 0.9 미만입니다.
- JSON 이외의 설명·마크다운·코드펜스는 출력하지 마세요.`;

    const userPrompt = `직원 목록(JSON 배열, id는 반드시 이 중에서만 선택):
${employeeJson}

사용자 지시문:
${userText}

출력 형식 (한 줄도 빠짐없이 JSON 객체만):
{"assigneeUserId":"... 또는 null","title":"...","dueDate":"YYYY-MM-DD","confidence":0.0}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    let aiRaw: string;
    try {
      aiRaw = await callAiByProvider(provider, messages);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "API 오류";
      return NextResponse.json(
        { error: `AI 처리 실패: ${msg}` },
        { status: 502 }
      );
    }

    let parsedAi: z.infer<typeof aiResultSchema>;
    try {
      const json = parseJsonFromAiText(aiRaw);
      const safe = aiResultSchema.safeParse(json);
      if (!safe.success) {
        return NextResponse.json(
          { error: "AI 응답 형식이 올바르지 않습니다.", details: safe.error.flatten() },
          { status: 502 }
        );
      }
      parsedAi = safe.data;
    } catch (e) {
      console.error("[delegate-task] JSON parse", e, aiRaw);
      return NextResponse.json({ error: "AI 응답을 해석할 수 없습니다." }, { status: 502 });
    }

    const idSet = new Set(employees.map((e) => e.id));
    let assigneeUserId = parsedAi.assigneeUserId ?? null;
    if (assigneeUserId && !idSet.has(assigneeUserId)) {
      assigneeUserId = null;
    }

    let confidence = parsedAi.confidence;
    if (!assigneeUserId) {
      confidence = Math.min(confidence, 0.69);
    }

    const assigneeName =
      assigneeUserId != null ? employees.find((e) => e.id === assigneeUserId)?.name ?? null : null;

    const parsedPayload = {
      assigneeUserId,
      title: parsedAi.title.trim(),
      dueDate: parsedAi.dueDate,
      confidence,
      assigneeName,
    };

    if (confidence < CONFIDENCE_MIN) {
      return NextResponse.json({
        needsConfirmation: true,
        parsed: parsedPayload,
      });
    }

    if (!assigneeUserId) {
      return NextResponse.json({
        needsConfirmation: true,
        parsed: { ...parsedPayload, confidence: 0.5 },
      });
    }

    const task = await createTaskWithNotifications({
      createdById: session.user.id,
      scope: "TEAM",
      data: {
        title: parsedPayload.title,
        description: null,
        dueDate: parsedPayload.dueDate,
        assignedToId: assigneeUserId,
      },
    });

    return NextResponse.json({
      created: true,
      task: jsonSerializeCreatedTask(task),
      assigneeName: assigneeName ?? task.assignedTo?.name ?? "",
    });
  } catch (e) {
    console.error("[delegate-task]", e);
    return NextResponse.json({ error: "프로젝트 지시 처리에 실패했습니다." }, { status: 500 });
  }
}
