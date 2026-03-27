import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { userCanAccessProject } from "@/lib/project-access";
import { syncQuotationProjectLink } from "@/lib/quote-project-link";
import { revalidatePath } from "next/cache";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, email: true, currentProjectId: true },
    });
    const role = (me?.role ?? session.user.role) as string | undefined;
    const allowed = await userCanAccessProject(session.user.id, id, {
      role,
      email: me?.email ?? (session.user as { email?: string }).email,
      currentProjectId: me?.currentProjectId,
    });
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        brand: { select: { id: true, name: true } },
        quote: {
          select: {
            id: true,
            title: true,
            finalAmount: true,
            validUntil: true,
            status: true,
            issuedAt: true,
            quotationNumber: true,
          },
        },
      },
    });
    if (!project) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const quoteId = project.quoteId ?? project.quote?.id ?? null;
    const paymentRequests = quoteId
      ? await prisma.paymentRequest.findMany({
          where: { quotationId: quoteId },
          orderBy: { requestedAt: "desc" },
          select: {
            id: true,
            amount: true,
            status: true,
            requestedAt: true,
            completedAt: true,
            description: true,
          },
        })
      : [];

    const quoted = project.quote?.finalAmount ?? project.quoteAmount ?? 0;
    const paid = paymentRequests
      .filter((p) => p.status === "COMPLETED")
      .reduce((s, p) => s + p.amount, 0);
    const outstanding = Math.max(0, quoted - paid);

    return NextResponse.json({
      ...project,
      paymentRequests,
      paymentSummary: { quoted, paid, outstanding },
    });
  } catch (e) {
    console.error("GET /api/projects/[id]", e);
    return NextResponse.json({ error: "프로젝트를 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: projectId } = await params;
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, email: true, currentProjectId: true },
    });
    const role = (me?.role ?? session.user.role) as string | undefined;
    const allowed = await userCanAccessProject(session.user.id, projectId, {
      role,
      email: me?.email ?? (session.user as { email?: string }).email,
      currentProjectId: me?.currentProjectId,
    });
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const quoteIdRaw = body?.quoteId;
    if (quoteIdRaw === undefined) {
      return NextResponse.json({ error: "quoteId가 필요합니다." }, { status: 400 });
    }
    if (quoteIdRaw !== null && typeof quoteIdRaw !== "string") {
      return NextResponse.json({ error: "quoteId가 올바르지 않습니다." }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      if (quoteIdRaw === null || quoteIdRaw === "") {
        const p = await tx.project.findUnique({
          where: { id: projectId },
          select: { quoteId: true },
        });
        if (p?.quoteId) {
          await syncQuotationProjectLink(tx, { quotationId: p.quoteId, projectId: null });
        }
        return;
      }
      if (typeof quoteIdRaw === "string" && quoteIdRaw.length > 0) {
        await syncQuotationProjectLink(tx, { quotationId: quoteIdRaw, projectId });
      }
    });

    revalidatePath("/quotations");
    revalidatePath(`/projects/${projectId}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/projects/[id]", e);
    const msg = e instanceof Error ? e.message : "";
    if (msg === "QUOTATION_NOT_FOUND") {
      return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ error: "저장할 수 없습니다." }, { status: 500 });
  }
}

/** 프로젝트 소프트삭제: deletedAt/deletedById만 기록, 실제 row는 유지 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        currentProjectId: true,
        email: true,
      },
    });
    const role = (me?.role ?? session.user.role) as string | undefined;
    const canDelete = await userCanAccessProject(session.user.id, id, {
      role,
      email: me?.email ?? (session.user as { email?: string }).email,
      currentProjectId: me?.currentProjectId,
    });

    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();

    // 이미 삭제된 건은 멱등 처리
    const existing = await prisma.project.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }
    if (existing.deletedAt) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }

    await prisma.$transaction([
      prisma.project.update({
        where: { id },
        data: { deletedAt: now, deletedById: session.user.id },
      }),
      // 삭제된 프로젝트가 currentProject로 붙어있으면 해제(퇴사/정리 시 사용자 화면 깨짐 방지)
      prisma.user.updateMany({
        where: { currentProjectId: id },
        data: { currentProjectId: null },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/projects/[id]", e);
    return NextResponse.json({ error: "프로젝트를 삭제할 수 없습니다." }, { status: 500 });
  }
}

