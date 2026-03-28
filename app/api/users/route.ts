import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { getCachedUsersWithProject } from "@/lib/cache/users-list";
import { hash } from "bcryptjs";
import { z } from "zod";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  name: z.string().min(1),
  role: z.enum(["USER", "TEAM_LEAD", "ADMIN", "EXECUTIVE"]).optional(),
  phone: z.string().optional(),
  workPhone: z.string().optional(),
  workEmail: z.string().email().optional().or(z.literal("")),
  bankAccount: z.string().optional(),
  residentId: z.string().optional(),
  address: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  joinDate: z.string().optional(),
});

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const users = await getCachedUsersWithProject();

    return NextResponse.json(users, {
      headers: {
        "Cache-Control": "private, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "직원 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id || (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // ADMIN은 EXECUTIVE 생성 불가 (대표/임원은 대표/임원만 생성)
    const requestedRole = parsed.data.role ?? "USER";
    if (requestedRole === "EXECUTIVE" && session.user.role !== "EXECUTIVE") {
      return NextResponse.json({ error: "대표/임원 계정은 대표/임원만 생성할 수 있습니다." }, { status: 403 });
    }

    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email.trim() },
    });
    if (existing) {
      return NextResponse.json(
        { error: "이미 사용 중인 이메일(아이디)입니다." },
        { status: 400 }
      );
    }

    const hashedPassword = await hash(parsed.data.password, 10);
    const joinDate = parsed.data.joinDate
      ? new Date(parsed.data.joinDate)
      : new Date();

    const user = await prisma.user.create({
      data: {
        email: parsed.data.email.trim(),
        password: hashedPassword,
        name: parsed.data.name.trim(),
        role: requestedRole,
        phone: parsed.data.phone?.trim() || null,
        workPhone: parsed.data.workPhone?.trim() || null,
        workEmail: parsed.data.workEmail?.trim() || null,
        bankAccount: parsed.data.bankAccount?.trim() || null,
        residentId: parsed.data.residentId?.trim() || null,
        address: parsed.data.address?.trim() || null,
        department: parsed.data.department?.trim() || null,
        position: parsed.data.position?.trim() || null,
        joinDate,
      },
      select: {
        id: true,
        email: true,
        name: true,
        department: true,
        position: true,
        joinDate: true,
      },
    });

    revalidateTag("users-list", "max");

    return NextResponse.json({
      ...user,
      joinDate: user.joinDate.toISOString().slice(0, 10),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "계정 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
