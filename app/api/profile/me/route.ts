import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { hashPasswordForStore } from "@/lib/employee-password";
import { z } from "zod";
import { getCurrentLeaveCalendarYearKst } from "@/lib/leave";
import { calculateLeavePool } from "@/lib/leave/calculate-pool";
import { ensureLegacyCarryAccrual } from "@/lib/leave/legacy-carry-sync";
import { saveOneSignalIdsToUser } from "@/lib/onesignal/save-player-to-user";

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

    const year = getCurrentLeaveCalendarYearKst();
    let balance: {
      annualTotal: number;
      annualUsed: number;
      manualDeduction: number;
      annualCarryOver?: number;
    } | null = null;
    try {
      balance = await prisma.leaveBalance.findUnique({
        where: { userId_year: { userId: session.user.id, year } },
        select: { annualTotal: true, annualUsed: true, manualDeduction: true, annualCarryOver: true },
      });
    } catch {
      // leaveBalance 없어도 진행
    }
    await ensureLegacyCarryAccrual(session.user.id);
    const pool = await calculateLeavePool(session.user.id, new Date());
    const carryOver = balance?.annualCarryOver ?? 0;
    const annualUsed = balance?.annualUsed ?? 0;
    const manualDeduction = balance?.manualDeduction ?? 0;
    const annualTotal = pool.totalEntitled;
    const leaveRemaining = pool.available;
    const totalAvailable = leaveRemaining + annualUsed + manualDeduction;
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

/** AI 비서: 임원·관리자만 Claude/Gemini 전환 (일반 직원은 스키마에 없어 PATCH로 변경 불가) */
const executiveAiProviderSchema = z.enum(["gemini", "claude"]).optional().nullable();

/** Prisma update 입력에서 undefined 제거 (일부 런타임에서 빈 필드 오류 방지) */
function omitUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Record<string, unknown>;
}

/**
 * DB 마이그레이션 누락 등으로 특정 컬럼이 없을 때 해당 필드만 제거하며 재시도.
 */
async function userUpdateWithSchemaFallback(
  userId: string,
  dataIn: Record<string, unknown>,
  selectBase: Record<string, unknown>
) {
  let attempt = omitUndefined({ ...dataIn });
  let lastErr: unknown = null;
  const sel = selectBase as Parameters<typeof prisma.user.update>[0]["select"];

  for (let i = 0; i < 12; i++) {
    const keys = Object.keys(attempt);
    if (keys.length === 0) {
      return prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: sel,
      });
    }
    try {
      return await prisma.user.update({
        where: { id: userId },
        data: attempt as Parameters<typeof prisma.user.update>[0]["data"],
        select: sel,
      });
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const unknownish =
        msg.includes("Unknown field") ||
        msg.includes("Unknown column") ||
        msg.includes("Unknown arg") ||
        msg.includes("does not exist") ||
        msg.includes("no such column");

      let badField: string | null = null;
      const m1 = /`User\.(\w+)`/.exec(msg);
      const m2 = /Unknown column ['"]?(\w+)/i.exec(msg);
      const m3 = /Unknown argument [`']?(\w+)/i.exec(msg);
      if (m1) badField = m1[1];
      else if (m2) badField = m2[1];
      else if (m3) badField = m3[1];

      if (unknownish && badField && badField in attempt) {
        delete attempt[badField];
        continue;
      }
      if (unknownish && keys.length > 1) {
        const dropOrder = [
          "playerIds",
          "playerId",
          "oneSignalPlayerId",
          "badgePreset",
          "preferredAiProvider",
          "address",
          "residentId",
          "bankAccount",
          "workEmail",
          "workPhone",
          "phone",
        ];
        let dropped = false;
        for (const k of dropOrder) {
          if (k in attempt) {
            delete attempt[k];
            dropped = true;
            break;
          }
        }
        if (dropped) continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

const updateByUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  password: z.string().min(8).optional(),
  phone: z.string().optional().nullable(),
  workPhone: z.string().optional().nullable(),
  workEmail: z.union([z.string().email(), z.literal("")]).optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  residentId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  badgePreset: badgePresetSchema,
  /** OneSignal 구독/플레이어 ID (푸시 디버그·include_subscription_ids) */
  oneSignalPlayerId: z.string().optional().nullable(),
  /** oneSignalPlayerId 와 동일 (클라이언트 편의 별칭) */
  playerId: z.string().optional().nullable(),
});

const updateByAdminSchema = updateByUserSchema.extend({
  preferredAiProvider: executiveAiProviderSchema,
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
      oneSignalPlayerId?: string | null;
      playerId?: string | null;
    } = {};
    if (parsed.data.name != null && parsed.data.name.trim()) data.name = parsed.data.name.trim();
    if (parsed.data.email != null) data.email = parsed.data.email.trim() || undefined;
    if (parsed.data.badgePreset !== undefined) data.badgePreset = parsed.data.badgePreset || null;
    if (parsed.data.password != null && parsed.data.password.length > 0) {
      const hashed = await hashPasswordForStore(parsed.data.password);
      if (!hashed.ok) {
        return NextResponse.json({ error: hashed.error }, { status: 400 });
      }
      data.password = hashed.hashed;
    }
    if (parsed.data.phone !== undefined) data.phone = parsed.data.phone?.trim() || null;
    if (parsed.data.workPhone !== undefined) data.workPhone = parsed.data.workPhone?.trim() || null;
    if (parsed.data.workEmail !== undefined) data.workEmail = parsed.data.workEmail?.trim() || null;
    if (parsed.data.bankAccount !== undefined) data.bankAccount = parsed.data.bankAccount?.trim() || null;
    if (parsed.data.residentId !== undefined) data.residentId = parsed.data.residentId?.trim() || null;
    if (parsed.data.address !== undefined) data.address = parsed.data.address?.trim() || null;
    if (parsed.data.department !== undefined) data.department = parsed.data.department?.trim() || null;
    if (parsed.data.position !== undefined) data.position = parsed.data.position?.trim() || null;
    const patchPlayer =
      parsed.data.oneSignalPlayerId !== undefined || parsed.data.playerId !== undefined
        ? (parsed.data.oneSignalPlayerId ?? parsed.data.playerId)?.trim() || null
        : undefined;
    if (patchPlayer !== undefined) {
      data.oneSignalPlayerId = patchPlayer;
      data.playerId = patchPlayer;
    }
    if (isAdmin && (parsed.data as any).joinDate != null) data.joinDate = new Date((parsed.data as any).joinDate);
    if (isAdmin) {
      const adminPatch = parsed.data as z.infer<typeof updateByAdminSchema>;
      if (adminPatch.preferredAiProvider !== undefined) {
        data.preferredAiProvider = adminPatch.preferredAiProvider ?? null;
      }
    }

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

    let dataCore = { ...data } as Record<string, unknown>;
    delete dataCore.badgePreset;
    delete dataCore.preferredAiProvider;
    delete dataCore.oneSignalPlayerId;
    delete dataCore.playerId;
    dataCore = omitUndefined(dataCore);

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
      user = (await userUpdateWithSchemaFallback(session.user.id, dataCore, selectBase)) as typeof user;
    } catch (updateErr) {
      const msg = updateErr instanceof Error ? updateErr.message : "";
      const isUnknownField =
        msg.includes("Unknown field") ||
        msg.includes("Unknown column") ||
        msg.includes("does not exist") ||
        msg.includes("no such column");
      if (isUnknownField) {
        const fallbackData = omitUndefined({
          name: data.name,
          email: data.email,
          password: data.password,
          joinDate: data.joinDate,
          department: data.department,
          position: data.position,
        }) as Record<string, unknown>;
        const u = await prisma.user.update({
          where: { id: session.user.id },
          data: fallbackData,
          select: {
            id: true,
            name: true,
            email: true,
            department: true,
            position: true,
            joinDate: true,
            role: true,
          },
        });
        user = {
          ...u,
          phone: null,
          workPhone: null,
          workEmail: null,
          bankAccount: null,
          residentId: null,
          department: u.department ?? null,
          position: u.position ?? null,
          joinDate: u.joinDate,
          role: u.role,
        };
      } else {
        throw updateErr;
      }
    }

    if (data.oneSignalPlayerId !== undefined) {
      try {
        await saveOneSignalIdsToUser(session.user.id, data.oneSignalPlayerId);
        console.log("[profile/me] OneSignal playerId 저장 완료", {
          userId: session.user.id,
          hasPlayerId: Boolean(data.oneSignalPlayerId && String(data.oneSignalPlayerId).trim()),
          len: data.oneSignalPlayerId ? String(data.oneSignalPlayerId).length : 0,
        });
      } catch (osErr) {
        console.warn("[profile/me] oneSignalPlayerId/playerId 저장 실패", osErr);
      }
    }

    (user as Record<string, unknown>).badgePreset = null;
    (user as Record<string, unknown>).preferredAiProvider = null;
    if (parsed.data.badgePreset !== undefined) {
      try {
        const updated = await prisma.user.update({
          where: { id: session.user.id },
          data: { badgePreset: parsed.data.badgePreset ?? null },
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

    const year = getCurrentLeaveCalendarYearKst();
    const poolBefore = await calculateLeavePool(session.user.id, new Date());
    const entitlement = poolBefore.totalEntitled;

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

    await ensureLegacyCarryAccrual(session.user.id);
    const pool = await calculateLeavePool(session.user.id, new Date());

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
    const annualTotal = pool.totalEntitled;
    const leaveRemaining = pool.available;
    const totalAvailable = leaveRemaining + annualUsed + manualDeduction;

    const joinDateStr =
      user.joinDate instanceof Date
        ? user.joinDate.toISOString().slice(0, 10)
        : new Date(user.joinDate).toISOString().slice(0, 10);
    const res: Record<string, unknown> = {
      ...user,
      joinDate: joinDateStr,
      leaveRemaining,
      annualTotal,
      annualCarryOver: carryOver,
      totalAvailable,
      annualUsed,
      manualDeduction,
    };

    try {
      revalidateTag("users-list", "max");
    } catch (revErr) {
      console.warn("[profile/me] revalidateTag users-list:", revErr);
    }

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
