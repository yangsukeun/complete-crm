import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import {
  getCurrentLeaveCalendarYearKst,
} from "@/lib/leave";
import { calculateLeavePool } from "@/lib/leave/calculate-pool";
import { ensureLegacyCarryAccrual } from "@/lib/leave/legacy-carry-sync";
import { ensureAccrualsUpTo } from "@/lib/leave/ensure-accruals";
import { getEmployeeManagerContext } from "@/lib/employee-admin-access-db";
import { canMutatePrivilegedEmployeeAccount } from "@/lib/employee-admin-access";
import { updateEmployeePassword } from "@/lib/employee-password";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["USER", "TEAM_LEAD", "CENTER_CHIEF", "EXECUTIVE", "ADMIN"]).optional(),
  department: z.string().nullable().optional(),
  position: z.string().nullable().optional(),
  bankAccount: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  workPhone: z.string().nullable().optional(),
  workEmail: z
    .union([z.string(), z.literal(""), z.null(), z.undefined()])
    .optional()
    .transform((v: any) => {
      if (v == null || (typeof v === "string" && v.trim() === "")) return null;
      return String(v).trim();
    })
    .refine((v: any) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "올바른 이메일 형식이 아닙니다."),
  currentProjectId: z.string().nullable().optional(),
  joinDate: z.string().optional(), // YYYY-MM-DD or ISO
  permissions: z.array(z.string()).optional().nullable(), // 사용 가능 기능 키 목록, null = 역할 기본값
  /** 휴가 소진 처리: 시스템 도입 전 이미 사용한 연차 일수. 최초 1회만 설정 가능. */
  manualDeduction: z.number().min(0).optional(),
  /** 전년도 이월 연차 일수 */
  annualCarryOver: z.number().min(0).optional(),
  /** 직원 수정 저장 시 비밀번호도 함께 변경 */
  password: z.string().trim().min(8).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const manager = await getEmployeeManagerContext(session.user.id);
    if (!manager?.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const sessionRole = String(manager.role ?? "").toUpperCase();

    const { id } = await params;
    const body = await req.json();
    if (id === session.user.id && body && typeof body === "object" && "role" in body) {
      const rawRole = (body as { role?: unknown }).role;
      if (rawRole !== undefined) {
        return NextResponse.json({ error: "본인의 역할은 변경할 수 없습니다." }, { status: 400 });
      }
    }
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.role != null && sessionRole !== "ADMIN") {
      return NextResponse.json(
        { error: "역할 변경은 시스템 관리자(ADMIN)만 할 수 있습니다." },
        { status: 403 }
      );
    }

    const data: Parameters<typeof prisma.user.update>[0]["data"] = {};
    if (parsed.data.name != null) data.name = parsed.data.name;
    if (parsed.data.role != null) data.role = parsed.data.role;
    if (parsed.data.department !== undefined) data.department = parsed.data.department;
    if (parsed.data.position !== undefined) data.position = parsed.data.position;
    if (parsed.data.bankAccount !== undefined) data.bankAccount = parsed.data.bankAccount?.trim() || null;
    if (parsed.data.address !== undefined) data.address = parsed.data.address?.trim() || null;
    if (parsed.data.workPhone !== undefined) data.workPhone = parsed.data.workPhone?.trim() || null;
    if (parsed.data.workEmail !== undefined) data.workEmail = parsed.data.workEmail;
    if (parsed.data.currentProjectId !== undefined) data.currentProjectId = parsed.data.currentProjectId;
    if (parsed.data.joinDate != null && String(parsed.data.joinDate).trim() !== "") {
      const joinDateVal = new Date(parsed.data.joinDate);
      if (!Number.isNaN(joinDateVal.getTime())) data.joinDate = joinDateVal;
    }
    if (parsed.data.permissions !== undefined) {
      data.permissions =
        parsed.data.permissions == null || parsed.data.permissions.length === 0
          ? null
          : JSON.stringify(parsed.data.permissions);
    }

    if (parsed.data.password) {
      const pwResult = await updateEmployeePassword({
        targetId: id,
        managerRole: manager.role,
        password: parsed.data.password,
      });
      if (!pwResult.ok) {
        return NextResponse.json({ error: pwResult.error }, { status: pwResult.status });
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        position: true,
        bankAccount: true,
        address: true,
        workPhone: true,
        workEmail: true,
        currentProject: { select: { id: true, name: true, brand: { select: { name: true } } } },
        joinDate: true,
        role: true,
        permissions: true,
      },
    });

    /** 연차 간이 발생액 계산 시 1회만 회사 규칙 조회(PATCH 에 manual·carryOver 둘 다 있을 때 중복 호출 방지) */
    let leaveCalcMemo: Promise<{ year: number; entitlement: number }> | null = null;
    const loadLeaveTotals = (): Promise<{ year: number; entitlement: number }> => {
      leaveCalcMemo ??= (async (): Promise<{ year: number; entitlement: number }> => {
        const yr = getCurrentLeaveCalendarYearKst();
        await ensureLegacyCarryAccrual(id);
        const pool = await calculateLeavePool(id, new Date());
        const entitlement = pool.totalEntitled;
        return { year: yr, entitlement };
      })();
      return leaveCalcMemo;
    };

    // 휴가 소진(실제 사용 차감): 일반 관리자는 최초 1회만, 마스터(EXECUTIVE)는 언제든 수정·되돌리기 가능
    if (parsed.data.manualDeduction !== undefined && parsed.data.manualDeduction >= 0) {
      try {
        const { year, entitlement } = await loadLeaveTotals();
        const balance = await prisma.leaveBalance.findUnique({
          where: { userId_year: { userId: id, year } },
        });
        // EXECUTIVE/ADMIN: 언제든 연차 차감(소진) 재입력 가능. 그 외: 최초 1회만.
        const canAlwaysEditDeduction = manager.ok;
        if (!balance) {
          await prisma.leaveBalance.create({
            data: {
              userId: id,
              year,
              annualTotal: entitlement,
              annualUsed: 0,
              manualDeduction: parsed.data.manualDeduction,
              annualCarryOver: 0,
            },
          });
        } else if (balance.manualDeduction === 0 || canAlwaysEditDeduction) {
          await prisma.leaveBalance.update({
            where: { userId_year: { userId: id, year } },
            data: { manualDeduction: parsed.data.manualDeduction },
          });
        }
      } catch (leaveErr) {
        console.error("PATCH users/[id] leaveBalance:", leaveErr);
      }
    }

    if (parsed.data.annualCarryOver !== undefined && parsed.data.annualCarryOver >= 0) {
      try {
        const { year, entitlement } = await loadLeaveTotals();
        await prisma.leaveBalance.upsert({
          where: { userId_year: { userId: id, year } },
          create: {
            userId: id,
            year,
            annualTotal: entitlement,
            annualUsed: 0,
            manualDeduction: 0,
            annualCarryOver: parsed.data.annualCarryOver,
          },
          update: { annualCarryOver: parsed.data.annualCarryOver },
        });
      } catch (carryErr) {
        console.error("PATCH users/[id] annualCarryOver:", carryErr);
      }
    }

    await ensureAccrualsUpTo(id);
    await ensureLegacyCarryAccrual(id);

    revalidateTag("users-list", "max");

    return NextResponse.json(user);
  } catch (e) {
    console.error(e);
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2025") {
      return NextResponse.json({ error: "해당 직원을 찾을 수 없습니다." }, { status: 404 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "직원 정보 수정에 실패했습니다.",
        ...(process.env.NODE_ENV === "development" ? { details: message } : {}),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const manager = await getEmployeeManagerContext(session.user.id);
    if (!manager?.ok) {
      return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
    }

    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    if (id === session.user.id) {
      return NextResponse.json({ error: "본인 계정은 삭제할 수 없습니다." }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: "해당 계정을 찾을 수 없습니다." }, { status: 404 });
    }

    const targetRole = String(target.role ?? "").toUpperCase();

    if (targetRole === "ADMIN" || targetRole === "EXECUTIVE") {
      if (!canMutatePrivilegedEmployeeAccount(manager.role)) {
        return NextResponse.json(
          { error: "대표/관리자 계정은 대표·관리자만 삭제할 수 있습니다." },
          { status: 403 }
        );
      }
      const adminCount = await prisma.user.count({
        where: { role: { in: ["ADMIN", "EXECUTIVE"] as any } },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "마지막 관리자 계정은 삭제할 수 없습니다." },
          { status: 400 }
        );
      }
      if (targetRole === "EXECUTIVE" && String(manager.role).toUpperCase() !== "EXECUTIVE") {
        return NextResponse.json(
          { error: "대표/임원 계정은 대표/임원만 삭제할 수 있습니다." },
          { status: 403 }
        );
      }
    }

    await prisma.user.delete({ where: { id } });
    revalidateTag("users-list", "max");
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2025") {
      return NextResponse.json({ error: "해당 계정을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ error: "계정 삭제에 실패했습니다." }, { status: 500 });
  }
}
