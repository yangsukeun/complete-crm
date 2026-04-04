import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import {
  callAiByProvider,
  type ChatMessage,
  type AIProvider,
} from "@/lib/ai/assist-client";
import {
  AI_HUB_COMPARE_SYSTEM,
  getAgentByKey,
  isAgentKey,
  type AgentKey,
} from "@/lib/ai-hub/agents";

export const dynamic = "force-dynamic";

const FALLBACK_MSG = "잠시 후 다시 시도해주세요";

async function safeAi(fn: () => Promise<string>): Promise<string> {
  try {
    return await fn();
  } catch (e) {
    console.error("[ai-hub]", e);
    return FALLBACK_MSG;
  }
}

function providerForAgentModel(model: string): AIProvider {
  if (model === "openai" || model === "gpt") return "openai";
  if (model === "gemini") return "gemini";
  return "claude";
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      type?: string;
      agentKey?: string;
      message?: string;
      systemPrompt?: string;
      agentName?: string;
      input?: string;
      output?: string;
    };

    const type = typeof body.type === "string" ? body.type : "";

    if (type === "saveHistory") {
      const agentKey = typeof body.agentKey === "string" ? body.agentKey : "";
      const agentName = typeof body.agentName === "string" ? body.agentName : "";
      const input = typeof body.input === "string" ? body.input : "";
      const output = typeof body.output === "string" ? body.output : "";
      if (!agentKey || !input.trim() || !output.trim()) {
        return NextResponse.json({ error: "필수 필드가 없습니다." }, { status: 400 });
      }
      await prisma.aiHubHistory.create({
        data: {
          userId: session.user.id,
          agentKey,
          agentName: agentName || agentKey,
          input,
          output,
        },
      });
      return NextResponse.json({ ok: true });
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "메시지가 비어 있습니다." }, { status: 400 });
    }

    if (type === "compare") {
      const msgs: ChatMessage[] = [
        { role: "system", content: AI_HUB_COMPARE_SYSTEM },
        { role: "user", content: message },
      ];
      const [claude, gpt, gemini] = await Promise.all([
        safeAi(() => callAiByProvider("claude", msgs)),
        safeAi(() => callAiByProvider("openai", msgs)),
        safeAi(() => callAiByProvider("gemini", msgs)),
      ]);
      return NextResponse.json({ claude, gpt, gemini });
    }

    if (type === "single") {
      const agentKeyRaw = typeof body.agentKey === "string" ? body.agentKey : "";
      if (!isAgentKey(agentKeyRaw) || agentKeyRaw === "compare") {
        return NextResponse.json({ error: "유효하지 않은 에이전트입니다." }, { status: 400 });
      }
      const agent = getAgentByKey(agentKeyRaw as AgentKey);
      if (!agent) {
        return NextResponse.json({ error: "에이전트를 찾을 수 없습니다." }, { status: 400 });
      }
      const serverPrompt = agent.systemPrompt.trim();
      const bodyPrompt =
        typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
      const systemContent = serverPrompt || bodyPrompt;
      if (!systemContent) {
        return NextResponse.json({ error: "시스템 프롬프트가 없습니다." }, { status: 400 });
      }

      const messages: ChatMessage[] = [
        { role: "system", content: systemContent },
        { role: "user", content: message },
      ];

      const provider = providerForAgentModel(agent.model);
      const text = await safeAi(() => callAiByProvider(provider, messages));
      return NextResponse.json({ text });
    }

    return NextResponse.json({ error: "알 수 없는 요청 유형입니다." }, { status: 400 });
  } catch (e) {
    console.error("[ai-hub] POST", e);
    return NextResponse.json({ error: FALLBACK_MSG }, { status: 500 });
  }
}
