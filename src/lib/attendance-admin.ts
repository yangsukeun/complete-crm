import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { isExecutiveOrAdmin } from "@/lib/role-access";

export async function requireAttendanceAdmin() {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isExecutiveOrAdmin(session.user.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, session };
}
