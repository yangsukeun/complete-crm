import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";
import { z } from "zod";
import { getAnnualLeaveEntitlement } from "@/lib/leave";

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let user: {
      id: string;
      name: string;
      email: string;
      phone?: string | null;
      workPhone?: string | null;
      workEmail?: string | null;
      bankAccount?: string | null;
      residentId?: string | null;
      address?: string | null;
      department: string | null;
      position: string | null;
      joinDate: Date;
      role: string;
    } | null = null;

    try {
      user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          workPhone: true,
          workEmail: true,
          bankAccount: true,
          residentId: true,
          address: true,
          department: true,
          position: true,
          currentProject: { select: { id: true, name: true, brand: { select: { name: true } } } },
          joinDate: true,
          role: true,
          preferredAiProvider: true,
        },
      });
      if (user) {
        (user as Record<string, unknown>).badgePreset = null;
        if (!("preferredAiProvider" in user)) (user as Record<string, unknown>).preferredAiProvider = null;
      }
    } catch (selectErr) {
      const msg = selectErr instanceof Error ? selectErr.message : "";
      const isUnknown = msg.includes("Unknown field") || msg.includes("Unknown column");
      const needsMinimal = isUnknown && (msg.includes("phone") || msg.includes("workPhone") || msg.includes("workEmail") || msg.includes("bankAccount") || msg.includes("residentId") || msg.includes("address") || msg.includes("currentProject"));
      if (!isUnknown) throw selectErr;
      if (needsMinimal) {
        user = (await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { id: true, name: true, email: true, department: true, joinDate: true, role: true },
        })) as any;
        if (user) {
          (user as Record<string, unknown>).phone = null;
          (user as Record<string, unknown>).workPhone = null;
          (user as Record<string, unknown>).workEmail = null;
          (user as Record<string, unknown>).bankAccount = null;
          (user as Record<string, unknown>).residentId = null;
          (user as Record<string, unknown>).address = null;
          (user as Record<string, unknown>).currentProject = null;
          (user as Record<string, unknown>).badgePreset = null;
          (user as Record<string, unknown>).preferredAiProvider = null;
        }
      } else {
        try {
          user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              workPhone: true,
              workEmail: true,
              bankAccount: true,
              residentId: true,
              address: true,
              department: true,
              position: true,
              joinDate: true,
              role: true,
            },
          });
          if (user) {
            (user as Record<string, unknown>).currentProject = null;
            (user as Record<string, unknown>).badgePreset = null;
            (user as Record<string, unknown>).preferredAiProvider = null;
          }
        } catch {
          throw selectErr;
        }
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const year = new Date().getFullYear();
    let balance: { annualUsed: number; manualDeduction: number; annualCarryOver?: number } | null = null;
    try {
      balance = await prisma.leaveBalance.findUnique({
        where: { userId_year: { userId: session.user.id, year } },
        select: { annualUsed: true, manualDeduction: true, annualCarryOver: true },
      });
    } catch {
      // leaveBalance 없어도 진행
    }
    const joinDateObj = user.joinDate instanceof Date ? user.joinDate : new Date(user.joinDate);
    const annualTotal = getAnnualLeaveEntitlement(joinDateObj, year);
    const carryOver = balance?.annualCarryOver ?? 0;
    const annualUsed = balance?.annualUsed ?? 0;
    const manualDeduction = balance?.manualDeduction ?? 0;
    const totalAvailable = annualTotal + carryOver;
    const leaveRemaining = Math.max(0, totalAvailable - annualUsed - manualDeduction);
    const joinDateStr =
      user.joinDate instanceof Date
        ? user.joinDate.toISOString().slice(0, 10)
        : new Date(user.joinDate).toISOString().slice(0, 10);

    return NextResponse.json({
      ...user,
      joinDate: joinDateStr,
      leaveRemaining,
      annualTotal,
      annualCarryOver: carryOver,
      totalAvailable,
      annualUsed,
      manualDeduction,
    });
  } catch (e) {
    console.error("Profile GET error:", e);
    const message = e instanceof Error ? e.message : "내 정보를 불러올 수 없습니다.";
    return NextResponse.json(
      { error: "내 정보를 불러올 수 없습니다.", details: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}

const badgePresetSchema = z.enum(["default", "violet", "amber", "emerald", "blue"]).optional().nullable();

const aiProviderSchema = z.enum(["gemini", "openai", "notebook"]).optional().nullable();

const updateByUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  password: z.string().min(4).optional(),
  phone: z.string().optional().nullable(),
  workPhone: z.string().optional().nullable(),
  workEmail: z.union([z.string().email(), z.literal("")]).optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  residentId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  badgePreset: badgePresetSchema,
  preferredAiProvider: aiProviderSchema,
});

const updateByAdminSchema = updateByUserSchema.extend({
  joinDate: z.string().optional(),
  leaveRemaining: z.number().min(0).optional(),
  manualDeduction: z.number().min(0).optional(), // 실제 사용한 일수 (최초 1회만)
  annualCarryOver: z.number().min(0).optional(), // 전년도 이월 연차 일수
});

export async function PATCH(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const isAdmin = session.user.role === "EXECUTIVE" || session.user.role === "ADMIN";
    const parsed = (isAdmin ? updateByAdminSchema : updateByUserSchema).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: {
      name?: string;
      email?: string;
      password?: string;
      phone?: string | null;
      workPhone?: string | null;
      workEmail?: string | null;
      bankAccount?: string | null;
      residentId?: string | null;
      address?: string | null;
      department?: string | null;
      position?: string | null;
      joinDate?: Date;
      badgePreset?: string | null;
      preferredAiProvider?: string | null;
    } = {};
    if (parsed.data.name != null && parsed.data.name.trim()) data.name = parsed.data.name.trim();
    if (parsed.data.email != null) data.email = parsed.data.email.trim() || undefined;
    if (parsed.data.badgePreset !== undefined) data.badgePreset = parsed.data.badgePreset || null;
    if (parsed.data.password != null && parsed.data.password.length >= 4) {
      data.password = await hash(parsed.data.password, 10);
    }
    if (parsed.data.phone !== undefined) data.phone = parsed.data.phone?.trim() || null;
    if (parsed.data.workPhone !== undefined) data.workPhone = parsed.data.workPhone?.trim() || null;
    if (parsed.data.workEmail !== undefined) data.workEmail = parsed.data.workEmail?.trim() || null;
    if (parsed.data.bankAccount !== undefined) data.bankAccount = parsed.data.bankAccount?.trim() || null;
    if (parsed.data.residentId !== undefined) data.residentId = parsed.data.residentId?.trim() || null;
    if (parsed.data.address !== undefined) data.address = parsed.data.address?.trim() || null;
    if (parsed.data.department !== undefined) data.department = parsed.data.department?.trim() || null;
    if (parsed.data.position !== undefined) data.position = parsed.data.position?.trim() || null;
    if (isAdmin && (parsed.data as any).joinDate != null) data.joinDate = new Date((parsed.data as any).joinDate);
    if (parsed.data.preferredAiProvider !== undefined)
      data.preferredAiProvider = parsed.data.preferredAiProvider ?? null;

    const selectBase = {
      id: true,
      name: true,
      email: true,
      phone: true,
      workPhone: true,
      workEmail: true,
      bankAccount: true,
      residentId: true,
      department: true,
      position: true,
      currentProject: { select: { id: true, name: true, brand: { select: { name: true } } } },
      joinDate: true,
      role: true,
    };

    const dataCore = { ...data } as Record<string, unknown>;
    delete dataCore.badgePreset;
    delete dataCore.preferredAiProvider;

    let user: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      workPhone: string | null;
      workEmail: string | null;
      bankAccount: string | null;
      residentId: string | null;
      department: string | null;
      position: string | null;
      joinDate: Date;
      role: string;
    };

    try {
      user = await prisma.user.update({
        where: { id: session.user.id },
        data: dataCore,
        select: selectBase,
      }) as typeof user;
    } catch (updateErr) {
      const msg = updateErr instanceof Error ? updateErr.message : "";
      const isUnknownField = msg.includes("Unknown field") || msg.includes("Unknown column");
      if (isUnknownField) {
        const fallbackData: { name?: string; email?: string; joinDate?: Date } = {};
        if (data.name != null) fallbackData.name = data.name;
        if (data.email != null) fallbackData.email = data.email;
        if (data.joinDate != null) fallbackData.joinDate = data.joinDate;
        const u = await prisma.user.update({
          where: { id: session.user.id },
          data: fallbackData,
          select: { id: true, name: true, email: true, department: true, joinDate: true, role: true },
        });
        user = {
          ...u,
          phone: null,
          workPhone: null,
          workEmail: null,
          bankAccount: null,
          residentId: null,
          department: u.department ?? null,
          position: null,
          joinDate: u.joinDate,
          role: u.role,
        };
      } else {
        throw updateErr;
      }
    }

    (user as Record<string, unknown>).badgePreset = null;
    (user as Record<string, unknown>).preferredAiProvider = null;
    if (data.badgePreset != null) {
      try {
        const updated = await prisma.user.update({
          where: { id: session.user.id },
          data: { badgePreset: data.badgePreset },
          select: { badgePreset: true },
        });
        (user as Record<string, unknown>).badgePreset = (updated as { badgePreset: string | null }).badgePreset ?? null;
      } catch {
        // badgePreset 컬럼이 없거나 오류 시 무시
      }
    }
    if (data.preferredAiProvider !== undefined) {
      try {
        const updated = await prisma.user.update({
          where: { id: session.user.id },
          data: { preferredAiProvider: data.preferredAiProvider },
          select: { preferredAiProvider: true },
        });
        (user as Record<string, unknown>).preferredAiProvider =
          (updated as { preferredAiProvider: string | null }).preferredAiProvider ?? null;
      } catch {
        // preferredAiProvider 컬럼이 없거나 오류 시 무시
      }
    }

    const year = new Date().getFullYear();
    const joinDateObj = user.joinDate instanceof Date ? user.joinDate : new Date(user.joinDate);
    const entitlement = getAnnualLeaveEntitlement(joinDateObj, year);

    if (isAdmin && (parsed.data as any).leaveRemaining !== undefined) {
      try {
        const annualUsed = Math.max(0, entitlement - (parsed.data as any).leaveRemaining);
        await prisma.leaveBalance.upsert({
          where: { userId_year: { userId: session.user.id, year } },
          create: { userId: session.user.id, year, annualTotal: entitlement, annualUsed, manualDeduction: 0, annualCarryOver: 0 },
          update: { annualUsed },
        });
      } catch (leaveBalanceErr) {
        console.error("Profile PATCH leaveBalance upsert:", leaveBalanceErr);
      }
    }

    if (isAdmin && (parsed.data as any).manualDeduction !== undefined) {
      try {
        let balance = await prisma.leaveBalance.findUnique({
          where: { userId_year: { userId: session.user.id, year } },
        });
        if (!balance) {
          await prisma.leaveBalance.create({
            data: {
              userId: session.user.id,
              year,
              annualTotal: entitlement,
              annualUsed: 0,
              manualDeduction: (parsed.data as any).manualDeduction,
              annualCarryOver: 0,
            },
          });
        } else {
          // 관리자: 언제든 연차 차감(소진) 재입력 가능
          await prisma.leaveBalance.update({
            where: { userId_year: { userId: session.user.id, year } },
            data: { manualDeduction: (parsed.data as any).manualDeduction },
          });
        }
      } catch (balanceErr) {
        console.error("Profile PATCH leaveBalance:", balanceErr);
      }
    }

    if (isAdmin && (parsed.data as any).annualCarryOver !== undefined) {
      try {
        const carryOver = Math.max(0, (parsed.data as any).annualCarryOver);
        await prisma.leaveBalance.upsert({
          where: { userId_year: { userId: session.user.id, year } },
          create: {
            userId: session.user.id,
            year,
            annualTotal: entitlement,
            annualCarryOver: carryOver,
            annualUsed: 0,
            manualDeduction: 0,
          },
          update: { annualCarryOver: carryOver },
        });
      } catch (carryErr) {
        console.error("Profile PATCH annualCarryOver:", carryErr);
      }
    }

    let balance: { annualUsed: number; manualDeduction?: number; annualCarryOver?: number } | null = null;
    try {
      balance = await prisma.leaveBalance.findUnique({
        where: { userId_year: { userId: session.user.id, year } },
        select: { annualUsed: true, manualDeduction: true, annualCarryOver: true },
      });
    } catch {
      try {
        balance = await prisma.leaveBalance.findUnique({
          where: { userId_year: { userId: session.user.id, year } },
          select: { annualUsed: true },
        });
        if (balance) (balance as Record<string, unknown>).manualDeduction = 0;
        if (balance) (balance as Record<string, unknown>).annualCarryOver = 0;
      } catch {
        // ignore
      }
    }
    const carryOver = (balance as { annualCarryOver?: number } | null)?.annualCarryOver ?? 0;
    const annualUsed = balance?.annualUsed ?? 0;
    const manualDeduction = (balance as { manualDeduction?: number } | null)?.manualDeduction ?? 0;
    const totalAvailable = entitlement + carryOver;
    const leaveRemaining = Math.max(0, totalAvailable - annualUsed - manualDeduction);

    const joinDateStr =
      user.joinDate instanceof Date
        ? user.joinDate.toISOString().slice(0, 10)
        : new Date(user.joinDate).toISOString().slice(0, 10);
    const res: Record<string, unknown> = {
      ...user,
      joinDate: joinDateStr,
      leaveRemaining,
      annualTotal: entitlement,
      annualCarryOver: carryOver,
      totalAvailable,
      annualUsed,
      manualDeduction,
    };

    return NextResponse.json(res);
  } catch (e) {
    console.error("Profile PATCH error:", e);
    const message = e instanceof Error ? e.message : "정보 수정에 실패했습니다.";
    return NextResponse.json(
      { error: "정보 수정에 실패했습니다.", details: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}
