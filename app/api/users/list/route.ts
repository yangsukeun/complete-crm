import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import { getCachedUsersMinimal } from "@/lib/cache/users-list";

/** 회사 모드에서 채팅 상대 선택 등용 - 로그인 사용자 본인 제외 직원 목록 */
export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const all = await getCachedUsersMinimal();
    const users = all.filter((u) => u.id !== session.user.id);

    return NextResponse.json(users, {
      headers: {
        "Cache-Control": "private, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "직원 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
