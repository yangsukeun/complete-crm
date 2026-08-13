import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import * as XLSX from "xlsx";
import { getEmployeeManagerContext } from "@/lib/employee-admin-access-db";

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const manager = await getEmployeeManagerContext(session.user.id);
    if (!manager?.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const headers = [
      "이메일",
      "비밀번호",
      "이름",
      "역할",
      "연락처",
      "은행계좌번호",
      "주소지",
      "생년월일",
      "주민번호",
      "부서",
      "직책",
      "입사일",
    ];
    const sampleRow = [
      "user@example.com",
      "1234",
      "홍길동",
      "USER",
      "010-1234-5678",
      "국민은행 123-456-789",
      "서울시 강남구 테헤란로 123",
      "1990-01-01",
      "900101-1234567",
      "개발팀",
      "경영관리 매니저",
      "2025-01-01",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "직원목록");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=직원등록_템플릿.xlsx",
      },
    });
  } catch (e) {
    console.error("Template download error:", e);
    return NextResponse.json({ error: "템플릿 다운로드에 실패했습니다." }, { status: 500 });
  }
}
