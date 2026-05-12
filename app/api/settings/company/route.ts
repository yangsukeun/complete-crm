import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const company = await prisma.companyInfo.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (!company) return NextResponse.json(null);
    // PostgreSQL 기준으로는 CompanyInfo 모델에 transferExecutorIds 컬럼이 이미 존재하므로
    // raw query 없이 그대로 반환한다.
    return NextResponse.json(company);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "회사 정보를 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getAppSession();
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

    const clampLeaveInt = (v: unknown): number | undefined => {
      if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
      return Math.round(Math.min(31, Math.max(0, v)));
    };

    /** undefined: 요청에 없음 · null: DB 필드 비움(앱 기본 11·15) */
    let annualLeaveMonthlyMaxUnderOneYear: number | null | undefined;
    if ("annualLeaveMonthlyMaxUnderOneYear" in body) {
      annualLeaveMonthlyMaxUnderOneYear =
        body.annualLeaveMonthlyMaxUnderOneYear === null
          ? null
          : clampLeaveInt(body.annualLeaveMonthlyMaxUnderOneYear);
    }
    let annualLeaveDaysAfterFirstFullYear: number | null | undefined;
    if ("annualLeaveDaysAfterFirstFullYear" in body) {
      annualLeaveDaysAfterFirstFullYear =
        body.annualLeaveDaysAfterFirstFullYear === null ? null : clampLeaveInt(body.annualLeaveDaysAfterFirstFullYear);
    }

    let useEncouragementEnabled: boolean | undefined;
    if ("useEncouragementEnabled" in body) {
      useEncouragementEnabled = Boolean(body.useEncouragementEnabled);
    }
    let attendanceThreshold: number | undefined;
    if ("attendanceThreshold" in body) {
      const v = body.attendanceThreshold;
      if (typeof v === "number" && Number.isFinite(v)) {
        attendanceThreshold = Math.min(1, Math.max(0.01, v));
      }
    }

    const data: {
      name: string;
      businessNumber: string | null;
      representative: string | null;
      address: string | null;
      phone: string | null;
      email: string | null;
      fax: string | null;
      stampImageUrl: string | null;
      annualLeaveMonthlyMaxUnderOneYear?: number | null;
      annualLeaveDaysAfterFirstFullYear?: number | null;
      useEncouragementEnabled?: boolean;
      attendanceThreshold?: number;
      transferExecutorIds?: string | null;
    } = {
      name,
      businessNumber: typeof body.businessNumber === "string" ? body.businessNumber.trim() || null : null,
      representative: typeof body.representative === "string" ? body.representative.trim() || null : null,
      address: typeof body.address === "string" ? body.address.trim() || null : null,
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      email: typeof body.email === "string" ? body.email.trim() || null : null,
      fax: typeof body.fax === "string" ? body.fax.trim() || null : null,
      stampImageUrl:
        body.stampImageUrl === undefined
          ? null
          : body.stampImageUrl === null || body.stampImageUrl === ""
            ? null
            : String(body.stampImageUrl),
    };
    if (transferExecutorIdsJson !== undefined) {
      data.transferExecutorIds = transferExecutorIdsJson;
    }
    if (annualLeaveMonthlyMaxUnderOneYear !== undefined) {
      data.annualLeaveMonthlyMaxUnderOneYear = annualLeaveMonthlyMaxUnderOneYear;
    }
    if (annualLeaveDaysAfterFirstFullYear !== undefined) {
      data.annualLeaveDaysAfterFirstFullYear = annualLeaveDaysAfterFirstFullYear;
    }
    if (useEncouragementEnabled !== undefined) {
      data.useEncouragementEnabled = useEncouragementEnabled;
    }
    if (attendanceThreshold !== undefined) {
      data.attendanceThreshold = attendanceThreshold;
    }

    const existing = await prisma.companyInfo.findFirst({ orderBy: { updatedAt: "desc" } });
    const company = existing
      ? await prisma.companyInfo.update({ where: { id: existing.id }, data })
      : await prisma.companyInfo.create({
          data: {
            ...data,
            annualLeaveMonthlyMaxUnderOneYear: data.annualLeaveMonthlyMaxUnderOneYear ?? 11,
            annualLeaveDaysAfterFirstFullYear: data.annualLeaveDaysAfterFirstFullYear ?? 15,
            useEncouragementEnabled: data.useEncouragementEnabled ?? false,
            attendanceThreshold: data.attendanceThreshold ?? 0.8,
          },
        });

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
