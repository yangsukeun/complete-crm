import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { markExpiredAccrualsPlain } from "@/lib/leave/expire-plain";

export const runtime = "nodejs";

/** UTC 16:00 = KST 01:00 — 만료 도래 accrual 단순 소멸 (수당·알림 없음) */
export async function GET(req: Request) {
  const unauthorized = verifyCronRequest(req);
  if (unauthorized) return unauthorized;

  const now = new Date();
  try {
    const expired = await markExpiredAccrualsPlain(now);
    console.log(`[cron/expire-leaves] ${expired} accruals at ${now.toISOString()}`);
    return NextResponse.json({ ok: true, expired, ranAt: now.toISOString() });
  } catch (e) {
    console.error("[cron/expire-leaves]", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
