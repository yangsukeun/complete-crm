import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";

const MODE_COOKIE = "app_mode" as const;
const MAX_AGE = 60 * 60 * 24 * 365;

function setModeCookie(res: NextResponse, mode: "company" | "personal") {
  res.cookies.set(MODE_COOKIE, mode, { path: "/", maxAge: MAX_AGE });
}

async function persistLastAppMode(userId: string, mode: "company" | "personal") {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastAppMode: mode },
    });
  } catch (e) {
    console.error("[mode] persist lastAppMode:", e);
  }
}

/** 쿠키가 없을 때 DB lastAppMode로 복구하고, 필요 시 Set-Cookie */
export async function GET() {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ mode: null });
  }
  const cookieStore = await cookies();
  const cookieRaw = cookieStore.get(MODE_COOKIE)?.value;
  let mode: "company" | "personal" | null =
    cookieRaw === "company" || cookieRaw === "personal" ? cookieRaw : null;

  if (!mode) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { lastAppMode: true },
      });
      const db = user?.lastAppMode;
      if (db === "company" || db === "personal") mode = db;
    } catch (e) {
      console.error("[mode] GET db fallback:", e);
    }
  }

  if (mode !== "company" && mode !== "personal") {
    return NextResponse.json({ mode: null });
  }

  const res = NextResponse.json({ mode });
  if (cookieRaw !== mode) {
    setModeCookie(res, mode);
  }
  return res;
}

export async function POST(req: Request) {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const mode = body.mode === "company" || body.mode === "personal" ? body.mode : null;
  if (!mode) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }
  await persistLastAppMode(session.user.id, mode);
  const res = NextResponse.json({ mode });
  setModeCookie(res, mode);
  return res;
}
