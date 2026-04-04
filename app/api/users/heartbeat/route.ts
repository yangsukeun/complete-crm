import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

export async function POST() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastActiveAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/users/heartbeat]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
