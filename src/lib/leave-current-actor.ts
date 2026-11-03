import prisma from "@/lib/prisma";

/** Never authorize leave operations from cached JWT roles or on lookup failure. */
export async function getCurrentLeaveActor(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, department: true, accountDisabled: true },
    });
    if (!user || user.accountDisabled) {
      return { ok: false as const, status: 403, error: "Forbidden" };
    }
    return { ok: true as const, user };
  } catch {
    return { ok: false as const, status: 503, error: "Authorization unavailable" };
  }
}
