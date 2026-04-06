import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import {
  callAnthropic,
  callGemini,
  callOpenAI,
  type ChatMessage,
} from "@/lib/ai/assist-client";
import {
  AI_HUB_COMPARE_SYSTEM,
  getAgentByKey,
  isAgentKey,
  type AgentKey,
} from "@/lib/ai-hub/agents";
import { getAiHubConfig } from "@/lib/ai-hub/get-ai-config";

export const dynamic = "force-dynamic";

const FALLBACK_MSG = "잠시 후 다시 시도해주세요";

function safeAi(fn: () => Promise<string>): Promise<string> {
  return fn().catch((e: unknown) => {
    console.error("[ai-hub] 에러:", e instanceof Error ? e.message : String(e));
    return FALLBACK_MSG;
  });
}

/** 에이전트 model 문자열 → 실제 호출 벤더 */
function hubProviderForModel(model: string): "claude" | "openai" | "gemini" {
  if (model === "openai" || model === "gpt") return "openai";
  if (model === "gemini") return "gemini";
  return "claude";
}

async function runSingleHubCall(
  provider: "claude" | "openai" | "gemini",
  messagesFull: ChatMessage[],
  config: ReturnType<typeof getAiHubConfig>
): Promise<string> {
  if (provider === "claude") {
    const k = config.claudeKey;
    if (!k) throw new Error("Claude API 키가 없습니다.");
    return callAnthropic(k, messagesFull, {
      model: config.claudeModel,
      useParamApiKeyOnly: true,
    });
  }
  if (provider === "openai") {
    const k = config.openaiKey;
    if (!k) throw new Error("OPENAI_API_KEY가 없습니다.");
    return callOpenAI(k, messagesFull, { model: config.openaiModel });
  }
  const k = config.geminiKey;
  if (!k) throw new Error("GEMINI_API_KEY가 없습니다.");
  return callGemini(k, messagesFull, { model: config.geminiModel });
}

export async function POST(req: Request) {
  try {
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
    const agentKeyRaw = typeof body.agentKey === "string" ? body.agentKey : "";
    const messageRaw = typeof body.message === "string" ? body.message : "";
    const message = messageRaw.trim();

    console.log("[ai-hub] 요청 받음:", {
      type,
      agentKey: agentKeyRaw || undefined,
      message: message ? message.slice(0, 50) : "",
    });

    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role;
    const config = getAiHubConfig(role);

    if (!message) {
      return NextResponse.json({ error: "메시지가 비어 있습니다." }, { status: 400 });
    }

    if (type === "compare") {
      const customSystem =
        typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
      const systemContent = customSystem || AI_HUB_COMPARE_SYSTEM;
      const msgs: ChatMessage[] = [
        { role: "system", content: systemContent },
        { role: "user", content: message },
      ];

      if (config.isExecutive) {
        console.log("[ai-hub] AI 호출 시작:", {
          model: "claude|gpt|gemini",
          agentKey: agentKeyRaw || "(compare)",
          isExecutive: config.isExecutive,
          modelNames: {
            claude: config.claudeModel,
            openai: config.openaiModel,
            gemini: config.geminiModel,
          },
        });

        const [claude, gpt, gemini] = await Promise.all([
          safeAi(() => runSingleHubCall("claude", msgs, config)),
          safeAi(() => runSingleHubCall("openai", msgs, config)),
          safeAi(() => runSingleHubCall("gemini", msgs, config)),
        ]);

        console.log("[ai-hub] AI 응답 완료");
        return NextResponse.json({ claude, gpt, gemini });
      }

      console.log("[ai-hub] AI 호출 시작:", {
        model: "gpt|gemini",
        agentKey: agentKeyRaw || "(compare)",
        isExecutive: config.isExecutive,
        modelNames: { openai: config.openaiModel, gemini: config.geminiModel },
      });

      const [gpt, gemini] = await Promise.all([
        safeAi(() => runSingleHubCall("openai", msgs, config)),
        safeAi(() => runSingleHubCall("gemini", msgs, config)),
      ]);

      console.log("[ai-hub] AI 응답 완료");
      return NextResponse.json({
        claude: null,
        gpt,
        gemini,
      });
    }

    if (type === "single") {
      if (!isAgentKey(agentKeyRaw) || agentKeyRaw === "compare") {
        return NextResponse.json({ error: "유효하지 않은 에이전트입니다." }, { status: 400 });
      }
      const agent = getAgentByKey(agentKeyRaw as AgentKey);
      if (!agent) {
        return NextResponse.json({ error: "에이전트를 찾을 수 없습니다." }, { status: 400 });
      }
      if (agent.model === "all") {
        return NextResponse.json(
          { error: "이 에이전트는 비교 모드로만 요청할 수 있습니다." },
          { status: 400 }
        );
      }
      const serverPrompt = agent.systemPrompt.trim();
      const bodyPrompt =
        typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
      const systemContent = bodyPrompt || serverPrompt;
      if (!systemContent) {
        return NextResponse.json({ error: "시스템 프롬프트가 없습니다." }, { status: 400 });
      }

      const messages: ChatMessage[] = [
        { role: "system", content: systemContent },
        { role: "user", content: message },
      ];

      let targetModel = agent.model;
      if (!config.isExecutive && targetModel === "claude") {
        targetModel = "gemini";
      }

      const provider = hubProviderForModel(targetModel);
      const modelName =
        provider === "claude"
          ? config.claudeModel
          : provider === "openai"
            ? config.openaiModel
            : config.geminiModel;

      console.log("[ai-hub] AI 호출 시작:", {
        model: targetModel,
        agentKey: agentKeyRaw,
        isExecutive: config.isExecutive,
        modelName,
        provider,
      });

      const text = await safeAi(() => runSingleHubCall(provider, messages, config));

      console.log("[ai-hub] AI 응답 완료");
      return NextResponse.json({ text });
    }

    return NextResponse.json({ error: "알 수 없는 요청 유형입니다." }, { status: 400 });
  } catch (e: unknown) {
    console.error("[ai-hub] 에러:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: FALLBACK_MSG }, { status: 500 });
  }
}
