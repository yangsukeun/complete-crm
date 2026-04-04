import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { syncQuotationProjectLink } from "@/lib/quote-project-link";
import { getServerWorkspaceScopeFromRequest } from "@/lib/workspace";
import { createTaskWithNotifications } from "@/lib/tasks/create-task";
import { revalidatePath } from "next/cache";

const createSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().min(1).max(80),
  quoteId: z.string().min(1).optional(),
  createLeadTask: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);

    /** 스케줄 캘린더: 마감일 없는 브랜드 프로젝트(Task의 project가 아닌 Project 테이블) */
    if (searchParams.get("noDueDate") === "1") {
      const masterEmail = (process.env.MASTER_EMAIL ?? "admin@complete.co.kr").trim().toLowerCase();
      const isMaster = String((session.user as { email?: string }).email ?? "")
        .trim()
        .toLowerCase() === masterEmail;
      const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
      const memberFilter =
        isAdmin || isMaster ? {} : { users: { some: { id: session.user.id } } };
      const list = await prisma.project.findMany({
        where: {
          deletedAt: null,
          dueDate: null,
          ...memberFilter,
        },
        select: {
          id: true,
          name: true,
          brand: { select: { id: true, name: true } },
        },
        orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
      });
      return NextResponse.json(list, {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
        },
      });
    }

    const brandId = searchParams.get("brandId") ?? undefined;
    const includeDeleted = searchParams.get("includeDeleted") === "1";
    const masterEmail = (process.env.MASTER_EMAIL ?? "admin@complete.co.kr").trim().toLowerCase();
    const isMaster = String((session.user as any)?.email ?? "").trim().toLowerCase() === masterEmail;

    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const baseWhere: any = brandId ? { brandId } : {};
    const projects = await prisma.project.findMany({
      where: { ...baseWhere, deletedAt: null },
      select: {
        id: true,
        name: true,
        brand: { select: { id: true, name: true } },
      },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    });
    if (includeDeleted && (isAdmin || isMaster)) {
      const deletedProjects = await prisma.project.findMany({
        where: { ...baseWhere, deletedAt: { not: null } },
        select: {
          id: true,
          name: true,
          deletedAt: true,
          brand: { select: { id: true, name: true } },
          deletedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { deletedAt: "desc" },
      });
      return NextResponse.json(
        { projects, deletedProjects, isMaster: !!isMaster },
        {
          headers: {
            "Cache-Control": "private, s-maxage=30, stale-while-revalidate=120",
          },
        }
      );
    }
    return NextResponse.json(projects, {
      headers: {
        "Cache-Control": "private, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    console.error("GET /api/projects", e);
    // Project 테이블 미생성 등으로 실패 시 빈 배열 반환 (500 방지)
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "브랜드와 프로젝트명을 입력하세요." }, { status: 400 });
    }
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const quoteId = parsed.data.quoteId;

    if (!quoteId) {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const project = await prisma.project.create({
        data: {
          brandId: parsed.data.brandId,
          name: parsed.data.name.trim(),
        },
        select: {
          id: true,
          name: true,
          brand: { select: { id: true, name: true } },
        },
      });
      return NextResponse.json(project);
    }

    const q = await prisma.quotation.findUnique({ where: { id: quoteId } });
    if (!q) {
      return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
    }
    if (q.projectId) {
      return NextResponse.json({ error: "이미 프로젝트에 연결된 견적서입니다." }, { status: 409 });
    }
    const canFromQuote = isAdmin || q.issuedById === session.user.id;
    if (!canFromQuote) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const nameTrim = parsed.data.name.trim();
    const scope = await getServerWorkspaceScopeFromRequest(req);

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          brandId: parsed.data.brandId,
          name: nameTrim,
          quoteAmount: 0,
          users: { connect: { id: session.user.id } },
        },
        select: { id: true, name: true },
      });
      await syncQuotationProjectLink(tx, { quotationId: q.id, projectId: created.id });
      return created;
    });

    if (parsed.data.createLeadTask) {
      const dueIso = q.validUntil.toISOString();
      await createTaskWithNotifications({
        createdById: session.user.id,
        scope,
        data: {
          title: `${nameTrim} 완료`,
          dueDate: dueIso,
          assigneeIds: [session.user.id],
          projectId: project.id,
        },
      });
    }

    const full = await prisma.project.findUnique({
      where: { id: project.id },
      select: {
        id: true,
        name: true,
        brand: { select: { id: true, name: true } },
      },
    });
    revalidatePath("/quotations");
    revalidatePath(`/projects/${project.id}`);
    return NextResponse.json(full ?? project);
  } catch (e) {
    console.error(e);
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "같은 브랜드에 동일한 프로젝트명이 이미 있습니다. 이름을 바꿔 주세요." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "프로젝트를 생성할 수 없습니다." }, { status: 500 });
  }
}

