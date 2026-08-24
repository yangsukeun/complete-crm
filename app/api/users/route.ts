import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAppSession } from "@/auth";
import { getCachedUsersWithProject } from "@/lib/cache/users-list";
import { z } from "zod";
import { getEmployeeManagerContext } from "@/lib/employee-admin-access-db";
import {
  canMutatePrivilegedEmployeeAccount,
  isEmployeeManageDelegate,
} from "@/lib/employee-admin-access";
import { createEmployee, CreateEmployeeError } from "@/lib/create-employee";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
  name: z.string().min(1),
  role: z.enum(["USER", "TEAM_LEAD", "CENTER_CHIEF", "ADMIN", "EXECUTIVE"]).optional(),
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
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const manager = await getEmployeeManagerContext(session.user.id);
    if (!manager?.ok) {
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
    // employee_manage 위임: USER 고정, 다른 role 요청 시 403
    let requestedRole = parsed.data.role ?? "USER";
    if (isEmployeeManageDelegate(manager.kind)) {
      if (parsed.data.role != null && parsed.data.role !== "USER") {
        return NextResponse.json(
          { error: "직원 관리 위임 권한으로는 역할을 지정할 수 없습니다. USER만 생성 가능합니다." },
          { status: 403 }
        );
      }
      requestedRole = "USER";
    } else {
      if (requestedRole === "EXECUTIVE" && !canMutatePrivilegedEmployeeAccount(manager.role)) {
        return NextResponse.json({ error: "대표/임원 계정은 대표/임원만 생성할 수 있습니다." }, { status: 403 });
      }
      if (requestedRole === "ADMIN" && !canMutatePrivilegedEmployeeAccount(manager.role)) {
        return NextResponse.json({ error: "관리자 계정은 대표/관리자만 생성할 수 있습니다." }, { status: 403 });
      }
    }

    const user = await createEmployee({
      email: parsed.data.email.trim(),
      password: parsed.data.password,
      name: parsed.data.name.trim(),
      role: requestedRole,
      phone: parsed.data.phone,
      workPhone: parsed.data.workPhone,
      workEmail: parsed.data.workEmail,
      bankAccount: parsed.data.bankAccount,
      residentId: parsed.data.residentId,
      address: parsed.data.address,
      department: parsed.data.department,
      position: parsed.data.position,
      joinDate: parsed.data.joinDate ? new Date(parsed.data.joinDate) : new Date(),
    });

    revalidateTag("users-list", "max");

    return NextResponse.json({
      ...user,
      joinDate: user.joinDate.toISOString().slice(0, 10),
    });
  } catch (e) {
    if (e instanceof CreateEmployeeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error(e);
    return NextResponse.json(
      { error: "계정 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
