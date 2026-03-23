import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(80),
});

function getTransferExecutorIds(idsJson: string | null): string[] {
  if (!idsJson?.trim()) return [];
  try {
    const arr = JSON.parse(idsJson) as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function cuidLike() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * 이체 담당자: 이체대기(TEAM_LEAD_APPROVED) 건을 여러 개 한 번에 COMPLETED 처리
 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "요청 ID 목록이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    const role = (dbUser?.role ?? session.user.role) as string | undefined;
    const isTeamLead = role === "TEAM_LEAD";

    const company = await prisma.companyInfo.findFirst({ orderBy: { updatedAt: "desc" } });
    const transferExecutorIds = getTransferExecutorIds(
      company?.transferExecutorIds ?? (company as { transferExecutorIds?: string | null })?.transferExecutorIds ?? null
    );
    const isTransferExecutor = transferExecutorIds.includes(session.user.id);

    if (isTeamLead) {
      return NextResponse.json(
        { error: "팀장은 일괄 이체완료를 사용할 수 없습니다. 이체 담당자에게 처리를 맡겨 주세요." },
        { status: 403 }
      );
    }
    if (!isTransferExecutor) {
      return NextResponse.json({ error: "이체 담당자만 일괄 이체완료할 수 있습니다." }, { status: 403 });
    }

    const ids = [...new Set(parsed.data.ids)];
    const rows = await prisma.paymentRequest.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, requesterId: true, vendorId: true },
    });

    if (rows.length !== ids.length) {
      return NextResponse.json({ error: "일부 결제 요청을 찾을 수 없습니다." }, { status: 400 });
    }

    for (const r of rows) {
      if (r.status !== "TEAM_LEAD_APPROVED") {
        return NextResponse.json(
          { error: "이체대기 상태인 건만 일괄 완료할 수 있습니다. 목록을 새로고침한 뒤 다시 선택하세요." },
          { status: 400 }
        );
      }
    }

    const now = new Date();
    await prisma.$transaction(
      ids.map((id) =>
        prisma.paymentRequest.update({
          where: { id },
          data: { status: "COMPLETED", completedAt: now },
        })
      )
    );

    const alertData = rows
      .filter((r) => r.requesterId)
      .map((r) => ({ id: cuidLike(), requestId: r.id, userId: r.requesterId! }));
    if (alertData.length > 0) {
      await prisma.paymentRequestAlert.createMany({
        data: alertData,
        skipDuplicates: true,
      });
    }

    await prisma.paymentRequestAlert.updateMany({
      where: { requestId: { in: ids }, userId: session.user.id },
      data: { readAt: now },
    });

    return NextResponse.json({ ok: true, count: ids.length });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "일괄 처리에 실패했습니다.", details: msg }, { status: 500 });
  }
}
