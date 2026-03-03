import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["PENDING", "TEAM_LEAD_APPROVED", "COMPLETED", "REJECTED"]),
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const currentRows = await prisma.$queryRawUnsafe<
      { id: string; status: string; requesterId: string; vendorId: string; amount: number; requestedAt: string; completedAt: string | null; description: string | null; attachment: string | null }[]
    >("SELECT id, status, requesterId, vendorId, amount, requestedAt, completedAt, description, attachment FROM PaymentRequest WHERE id = ?", id);
    const current = currentRows[0];
    if (!current) {
      return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
    }

    const dbUserRows = await prisma.$queryRawUnsafe<{ role: string }[]>(
      "SELECT role FROM User WHERE id = ?",
      session.user.id
    );
    const dbUser = dbUserRows[0];
    const role = (dbUser?.role ?? session.user.role) as string | undefined;
    const isTeamLead = role === "TEAM_LEAD";

    const company = await prisma.companyInfo.findFirst({ orderBy: { updatedAt: "desc" } });
    let transferExecutorIds: string[] = [];
    if (company?.id) {
      try {
        const rows = await prisma.$queryRawUnsafe<{ transferExecutorIds: string | null }[]>(
          "SELECT transferExecutorIds FROM CompanyInfo WHERE id = ?",
          company.id
        );
        transferExecutorIds = getTransferExecutorIds(rows[0]?.transferExecutorIds ?? null);
      } catch {
        transferExecutorIds = getTransferExecutorIds((company as { transferExecutorIds?: string | null })?.transferExecutorIds ?? null);
      }
    }
    const isTransferExecutor = transferExecutorIds.includes(session.user.id);

    // 팀장: PENDING ↔ 이체대기(TEAM_LEAD_APPROVED) / 반려(REJECTED). 이체대기 건은 승인대기로 되돌리기·반려 가능.
    if (isTeamLead) {
      if (parsed.data.status === "COMPLETED") {
        return NextResponse.json(
          { error: "이체 완료는 이체 담당자만 처리할 수 있습니다." },
          { status: 403 }
        );
      }
      if (current.status === "PENDING") {
        if (parsed.data.status !== "TEAM_LEAD_APPROVED" && parsed.data.status !== "REJECTED") {
          return NextResponse.json({ error: "승인 또는 반려만 가능합니다." }, { status: 400 });
        }
      } else if (current.status === "TEAM_LEAD_APPROVED") {
        if (parsed.data.status !== "PENDING" && parsed.data.status !== "REJECTED") {
          return NextResponse.json({ error: "승인 대기로 되돌리기 또는 반려만 가능합니다." }, { status: 400 });
        }
      } else {
        return NextResponse.json(
          { error: "승인대기 또는 이체대기 건만 처리할 수 있습니다." },
          { status: 400 }
        );
      }
    }

    // 이체 담당자: TEAM_LEAD_APPROVED → COMPLETED(이체완료) 만 가능
    if (isTransferExecutor && !isTeamLead) {
      if (parsed.data.status !== "COMPLETED") {
        return NextResponse.json(
          { error: "이체 담당자는 이체 완료만 처리할 수 있습니다." },
          { status: 403 }
        );
      }
      if (current.status !== "TEAM_LEAD_APPROVED") {
        return NextResponse.json(
          { error: "팀장 승인된 건만 이체 완료할 수 있습니다." },
          { status: 400 }
        );
      }
    }

    // 팀장도 아니고 이체 담당자도 아니면 거부
    if (!isTeamLead && !isTransferExecutor) {
      return NextResponse.json(
        { error: "결재 담당자(팀장) 또는 이체 담당자만 처리할 수 있습니다." },
        { status: 403 }
      );
    }

    const completedAt = parsed.data.status === "COMPLETED" ? new Date().toISOString() : null;
    try {
      await prisma.$executeRawUnsafe(
        "UPDATE PaymentRequest SET status = ?, completedAt = ? WHERE id = ?",
        parsed.data.status,
        completedAt,
        id
      );
    } catch (updateErr) {
      const msg = updateErr instanceof Error ? updateErr.message : String(updateErr);
      console.error("PaymentRequest UPDATE failed:", msg);
      return NextResponse.json(
        { error: "처리 상태 변경에 실패했습니다.", details: msg },
        { status: 500 }
      );
    }

    // 알람: raw SQL로 처리 (Prisma 클라이언트 이슈 우회)
    const now = new Date().toISOString();
    const cuidLike = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`;
    // 이체대기 → 승인대기/반려 되돌리기 시: 해당 건 알람 전부 삭제(취소되면 대표·이체담당자 알람 사라짐)
    if (current.status === "TEAM_LEAD_APPROVED" && (parsed.data.status === "PENDING" || parsed.data.status === "REJECTED")) {
      try {
        await prisma.paymentRequestAlert.deleteMany({ where: { requestId: id } });
      } catch (e) {
        try {
          await prisma.$executeRawUnsafe(
            "DELETE FROM PaymentRequestAlert WHERE requestId = ?",
            id
          );
        } catch (rawErr) {
          console.error("되돌리기 시 알람 삭제 실패:", e, rawErr);
        }
      }
    }
    if (isTeamLead && parsed.data.status === "TEAM_LEAD_APPROVED" && transferExecutorIds.length > 0) {
      for (const userId of transferExecutorIds) {
        try {
          await prisma.$executeRawUnsafe(
            "INSERT OR IGNORE INTO PaymentRequestAlert (id, requestId, userId, createdAt) VALUES (?, ?, ?, ?)",
            cuidLike(),
            id,
            userId,
            now
          );
        } catch (_) {
          // skip duplicate or DB error
        }
      }
    }
    if (parsed.data.status === "COMPLETED" && current.requesterId) {
      try {
        await prisma.$executeRawUnsafe(
          "INSERT OR IGNORE INTO PaymentRequestAlert (id, requestId, userId, createdAt) VALUES (?, ?, ?, ?)",
          cuidLike(),
          id,
          current.requesterId,
          now
        );
      } catch (_) {}
    }
    try {
      await prisma.$executeRawUnsafe(
        "UPDATE PaymentRequestAlert SET readAt = ? WHERE requestId = ? AND userId = ?",
        now,
        id,
        session.user.id
      );
    } catch (_) {}

    const updatedRows = await prisma.$queryRawUnsafe<
      { id: string; status: string; amount: number; requestedAt: string; completedAt: string | null; description: string | null; attachment: string | null; requesterId: string; vendorId: string }[]
    >("SELECT id, status, amount, requestedAt, completedAt, description, attachment, requesterId, vendorId FROM PaymentRequest WHERE id = ?", id);
    const updated = updatedRows[0];
    if (!updated) {
      return NextResponse.json({ id, status: parsed.data.status, completedAt, requesterId: current.requesterId, vendorId: current.vendorId, amount: current.amount, requestedAt: current.requestedAt, description: current.description, attachment: current.attachment, requester: null, vendor: null });
    }
    const [requesterRows, vendorRows] = await Promise.all([
      prisma.$queryRawUnsafe<{ id: string; name: string; email: string; position: string | null }[]>("SELECT id, name, email, position FROM User WHERE id = ?", updated.requesterId),
      prisma.$queryRawUnsafe<{ id: string; name: string; bankName: string; accountNumber: string; ownerName: string; category: string }[]>("SELECT id, name, bankName, accountNumber, ownerName, category FROM Vendor WHERE id = ?", updated.vendorId),
    ]);
    const requester = requesterRows[0] ?? null;
    const vendor = vendorRows[0] ?? null;
    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      amount: updated.amount,
      requestedAt: updated.requestedAt,
      completedAt: updated.completedAt,
      description: updated.description,
      attachment: updated.attachment,
      requesterId: updated.requesterId,
      vendorId: updated.vendorId,
      requester: requester ? { id: requester.id, name: requester.name, email: requester.email, position: requester.position } : null,
      vendor,
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "처리 상태 변경에 실패했습니다.", details: msg },
      { status: 500 }
    );
  }
}
