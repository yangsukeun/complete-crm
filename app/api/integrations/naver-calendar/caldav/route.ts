import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { encryptSecret, secretBoxConfigured } from "@/lib/secret-box";
import {
  clearNaverCalendarDiscoveryCache,
  NaverCalDavError,
  verifyNaverCalDavAuth,
} from "@/lib/naver-caldav";

export const runtime = "nodejs";

const connectSchema = z.object({
  naverId: z.string().trim().min(1, "네이버 아이디를 입력하세요."),
  password: z.string().min(1, "비밀번호를 입력하세요."),
});

/** 연결 상태 */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [account, importedCount] = await Promise.all([
      prisma.naverCalDavAccount.findUnique({
        where: { userId: session.user.id },
        select: { naverId: true, lastSyncedAt: true, lastError: true },
      }),
      prisma.externalCalendarEvent.count({
        where: { userId: session.user.id, source: "naver_ics" },
      }),
    ]);
    return NextResponse.json({
      connected: !!account,
      configured: secretBoxConfigured(),
      naverId: account?.naverId ?? null,
      lastSyncedAt: account?.lastSyncedAt ?? null,
      lastError: account?.lastError ?? null,
      importedCount,
    });
  } catch (e) {
    console.error("[naver-caldav] GET", e);
    return NextResponse.json({ connected: false, configured: false });
  }
}

/** 네이버 아이디 + 앱 비밀번호로 연결 */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!secretBoxConfigured()) {
      return NextResponse.json(
        { error: "서버에 암호화 키가 설정되지 않아 연결할 수 없습니다." },
        { status: 503 }
      );
    }

    const parsed = connectSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
        { status: 400 }
      );
    }
    const { naverId, password } = parsed.data;

    try {
      await verifyNaverCalDavAuth({ naverId, password });
    } catch (err) {
      const status = err instanceof NaverCalDavError && err.kind === "auth" ? 401 : 502;
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "네이버 캘린더 연결에 실패했습니다." },
        { status }
      );
    }

    const passwordCipher = encryptSecret(password);
    await prisma.naverCalDavAccount.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, naverId, passwordCipher, lastSyncedAt: new Date() },
      update: { naverId, passwordCipher, lastError: null, lastSyncedAt: new Date() },
    });

    return NextResponse.json({ ok: true, connected: true, naverId });
  } catch (e) {
    console.error("[naver-caldav] POST", e);
    return NextResponse.json({ error: "네이버 캘린더 연결에 실패했습니다." }, { status: 500 });
  }
}

/** 연결 해제 (저장된 자격증명 삭제) */
export async function DELETE() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const existing = await prisma.naverCalDavAccount.findUnique({
      where: { userId: session.user.id },
      select: { naverId: true },
    });
    await prisma.naverCalDavAccount.deleteMany({ where: { userId: session.user.id } });
    clearNaverCalendarDiscoveryCache(existing?.naverId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[naver-caldav] DELETE", e);
    return NextResponse.json({ error: "연결 해제에 실패했습니다." }, { status: 500 });
  }
}
