import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getAppSession } from "@/auth";

/**
 * NextAuth 세션 사용자로 Supabase Realtime(postgres_changes) 구독용 JWT.
 * 서명: Supabase Dashboard → Project Settings → API → JWT Secret (= SUPABASE_JWT_SECRET)
 */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const secretRaw = process.env.SUPABASE_JWT_SECRET?.trim();
    if (!baseUrl || !secretRaw) {
      return NextResponse.json(
        { error: "Supabase Realtime is not configured", configured: false },
        { status: 503 }
      );
    }

    let iss: string;
    try {
      const u = new URL(baseUrl);
      iss = `${u.origin}/auth/v1`;
    } catch {
      return NextResponse.json({ error: "Invalid NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600;
    const accessToken = await new SignJWT({
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(session.user.id)
      .setIssuer(iss)
      .setAudience("authenticated")
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(new TextEncoder().encode(secretRaw));

    return NextResponse.json({ accessToken, exp, configured: true });
  } catch (e) {
    console.error("[realtime-token]", e);
    return NextResponse.json({ error: "Token issue failed" }, { status: 500 });
  }
}
