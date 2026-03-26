import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role ?? "";
    const isAdmin = role === "ADMIN" || role === "EXECUTIVE";

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

    /** 스키마 필드명은 joinDate (hireDate 는 API 별칭). User.joinDate 는 non-null 이라 비우기 불가 */
    const data: { joinDate?: Date } = {};

    if (hireDateValue !== undefined) {
      if (hireDateValue === null || hireDateValue === "") {
        return NextResponse.json(
          { error: "입사일을 비울 수 없습니다. 유효한 날짜를 입력하세요." },
          { status: 400 }
        );
      }
      const d = new Date(hireDateValue);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "입사일 형식이 올바르지 않습니다." }, { status: 400 });
      }
      data.joinDate = d;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "수정할 필드가 없습니다." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: effectiveUserId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        joinDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    revalidateTag("users-list", "max");

    return NextResponse.json({
      ...updated,
      hireDate: updated.joinDate.toISOString(),
      joinDate: updated.joinDate.toISOString(),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error("[PATCH /api/users/update]", err);
    const message = err instanceof Error ? err.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
