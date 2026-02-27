import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { FEATURE_KEYS, FEATURE_LABELS } from "@/lib/permissions";

/** 관리자용: 기능 목록 (키·라벨) 반환 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = String(session.user.role ?? "").toUpperCase();
  if (role !== "EXECUTIVE" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const list = FEATURE_KEYS.map((key: string) => ({ key, label: FEATURE_LABELS[key] ?? key }));
  return NextResponse.json(list);
}
