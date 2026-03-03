import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { cookies } from "next/headers";

export async function GET() {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return NextResponse.json({ mode: null });
  }
  const cookieStore = await cookies();
  const mode = cookieStore.get("app_mode")?.value;
  if (mode !== "company" && mode !== "personal") {
    return NextResponse.json({ mode: null });
  }
  return NextResponse.json({ mode });
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
  const res = NextResponse.json({ mode });
  res.cookies.set("app_mode", mode, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
