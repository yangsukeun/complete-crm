import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

/** 서버에 저장된 모드 선호( User.lastAppMode ) — 쿠키와 별도로 동기화. 항상 멱등, 409 없음 */
export async function GET() {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { lastAppMode: true },
    });
    return NextResponse.json({ lastAppMode: user?.lastAppMode ?? null });
  } catch (e) {
    console.error("GET /api/identity:", e);
    return NextResponse.json({ lastAppMode: null });
  }
}

export async function POST(req: Request) {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const mode =
    typeof body === "object" &&
    body !== null &&
    "mode" in body &&
    ((body as { mode: unknown }).mode === "company" ||
      (body as { mode: unknown }).mode === "personal")
      ? (body as { mode: "company" | "personal" }).mode
      : null;
  if (!mode) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }
  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastAppMode: mode },
    });
  } catch (e) {
    console.error("POST /api/identity persist:", e);
  }
  return NextResponse.json({ ok: true });
}
