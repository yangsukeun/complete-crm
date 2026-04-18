import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { subDays } from "date-fns";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";

/** Vercel Cron: 오래된 완료 업무를 아카이브(표시만 제외, 삭제 아님) */
export async function GET(req: Request) {
  const denied = verifyCronRequest(req);
  if (denied) return denied;

  const cutoff = subDays(new Date(), 30);
  const result = await prisma.task.updateMany({
    where: {
      status: "DONE",
      archivedAt: null,
      completedAt: { lt: cutoff },
    },
    data: { archivedAt: new Date() },
  });

  console.log("[archive-tasks] archived count:", result.count);
  return NextResponse.json({ ok: true, archived: result.count });
}
