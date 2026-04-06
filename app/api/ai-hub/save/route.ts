import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      agentKey?: string;
      agentName?: string;
      input?: string;
      output?: string;
      selectedModel?: string | null;
    };

    const agentKey = typeof body.agentKey === "string" ? body.agentKey : "";
    const agentName = typeof body.agentName === "string" ? body.agentName : "";
    const input = typeof body.input === "string" ? body.input : "";
    const output = typeof body.output === "string" ? body.output : "";
    const selectedModel =
      body.selectedModel === null || body.selectedModel === undefined
        ? null
        : typeof body.selectedModel === "string"
          ? body.selectedModel
          : null;

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
        selectedModel,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ai-hub/save]", e);
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }
}
