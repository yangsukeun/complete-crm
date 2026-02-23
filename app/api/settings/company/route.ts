import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const company = await prisma.companyInfo.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (!company) return NextResponse.json(null);

    const rows = await prisma.$queryRawUnsafe<{ transferExecutorIds: string | null }[]>(
      "SELECT transferExecutorIds FROM CompanyInfo WHERE id = ?",
      company.id
    );
    const transferExecutorIds = rows[0]?.transferExecutorIds ?? null;
    return NextResponse.json({ ...company, transferExecutorIds });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "회사 정보를 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "관리자만 수정할 수 있습니다." }, { status: 403 });
    }
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "회사명은 필수입니다." }, { status: 400 });
    }
    const transferExecutorIds =
      Array.isArray(body.transferExecutorIds) && body.transferExecutorIds.every((x: unknown) => typeof x === "string")
        ? body.transferExecutorIds
        : undefined;
    const transferExecutorIdsJson =
      transferExecutorIds !== undefined ? JSON.stringify(transferExecutorIds) : undefined;

    const data: {
      name: string;
      businessNumber: string | null;
      representative: string | null;
      address: string | null;
      phone: string | null;
      email: string | null;
      fax: string | null;
      stampImageUrl: string | null;
    } = {
      name,
      businessNumber: typeof body.businessNumber === "string" ? body.businessNumber.trim() || null : null,
      representative: typeof body.representative === "string" ? body.representative.trim() || null : null,
      address: typeof body.address === "string" ? body.address.trim() || null : null,
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      email: typeof body.email === "string" ? body.email.trim() || null : null,
      fax: typeof body.fax === "string" ? body.fax.trim() || null : null,
      stampImageUrl: body.stampImageUrl === undefined ? undefined : (body.stampImageUrl === null || body.stampImageUrl === "" ? null : String(body.stampImageUrl)),
    };

    const existing = await prisma.companyInfo.findFirst({ orderBy: { updatedAt: "desc" } });
    let company = existing
      ? await prisma.companyInfo.update({ where: { id: existing.id }, data })
      : await prisma.companyInfo.create({ data });

    if (transferExecutorIdsJson !== undefined) {
      await prisma.$executeRawUnsafe(
        "UPDATE CompanyInfo SET transferExecutorIds = ?, updatedAt = ? WHERE id = ?",
        transferExecutorIdsJson,
        new Date(),
        company.id
      );
      company = await prisma.companyInfo.findFirstOrThrow({
        where: { id: company.id },
      });
    }

    return NextResponse.json(company);
  } catch (e) {
    console.error("[Company PATCH]", e);
    const message = e instanceof Error ? e.message : "회사 정보 저장에 실패했습니다.";
    return NextResponse.json(
      { error: "회사 정보 저장에 실패했습니다.", detail: message },
      { status: 500 }
    );
  }
}
