import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const isAdmin = (session.user as { role?: string }).role === "admin";

    let body: { userId?: string; hireDate?: string | null };
    try {
      body = await req.json();
    } catch (e) {
      console.error("[PATCH /api/users/update] JSON parse error", e);
      return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
    }

    const { userId: targetUserId, hireDate: hireDateValue } = body;

    const effectiveUserId =
      isAdmin && targetUserId && targetUserId !== session.user.id
        ? targetUserId
        : session.user.id;

    if (effectiveUserId !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: "본인 정보만 수정할 수 있습니다." }, { status: 403 });
    }

    const data: { hireDate?: Date | null } = {};

    if (hireDateValue !== undefined) {
      if (hireDateValue === null || hireDateValue === "") {
        data.hireDate = null;
      } else {
        const d = new Date(hireDateValue);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "입사일 형식이 올바르지 않습니다." }, { status: 400 });
        }
        data.hireDate = d;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "수정할 필드가 없습니다." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: effectiveUserId },
      data: data as any,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        totalLeaves: true,
        usedLeaves: true,
        createdAt: true,
        updatedAt: true,
      } as any,
    });

    return NextResponse.json({
      ...(updated as any),
      hireDate: (updated as any).hireDate?.toISOString?.() ?? null,
      createdAt: (updated as any).createdAt?.toISOString?.() ?? new Date().toISOString(),
      updatedAt: (updated as any).updatedAt?.toISOString?.() ?? new Date().toISOString(),
    });
  } catch (err) {
    console.error("[PATCH /api/users/update]", err);
    const message = err instanceof Error ? err.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
