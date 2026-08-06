// 연동 확인 후 삭제 예정
import { getAppSession } from "@/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getAppSession();
  if (!session?.user?.id) {
    return new Response(null, { status: 404 });
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN" && role !== "EXECUTIVE") {
    return new Response(null, { status: 404 });
  }

  throw new Error("Sentry 연동 테스트 " + Date.now());
}
