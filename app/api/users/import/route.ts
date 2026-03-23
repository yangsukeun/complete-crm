import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";

type Row = Record<string, unknown>;

function toStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v).trim();
  return String(v).trim();
}

function parseDate(v: unknown): Date | null {
  const s = toStr(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id || (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || !file.size) {
      return NextResponse.json({ error: "엑셀 파일을 선택하세요." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buf, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) {
      return NextResponse.json({ error: "엑셀 시트를 읽을 수 없습니다." }, { status: 400 });
    }

    const rows = XLSX.utils.sheet_to_json<Row>(firstSheet, { defval: "" });
    if (rows.length === 0) {
      return NextResponse.json({ error: "엑셀에 데이터가 없습니다." }, { status: 400 });
    }

    const created: { email: string; name: string }[] = [];
    const errors: { row: number; email?: string; message: string }[] = [];
    const emailSet = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-based, +1 for header

      // 컬럼명: 이메일, 비밀번호, 이름, 역할, 연락처, 통장번호, 주민번호, 부서, 직책, 입사일
      const email = toStr(row["이메일"] ?? row["email"] ?? row["Email"]);
      const password = toStr(row["비밀번호"] ?? row["password"] ?? row["Password"]);
      const name = toStr(row["이름"] ?? row["name"] ?? row["Name"]);

      if (!email || !name) {
        errors.push({ row: rowNum, email: email || "(없음)", message: "이메일과 이름은 필수입니다." });
        continue;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, email, message: "올바른 이메일 형식이 아닙니다." });
        continue;
      }

      if (!password || password.length < 4) {
        errors.push({ row: rowNum, email, message: "비밀번호는 4자 이상 입력하세요." });
        continue;
      }

      if (emailSet.has(email.toLowerCase())) {
        errors.push({ row: rowNum, email, message: "같은 파일 내 중복 이메일입니다." });
        continue;
      }
      emailSet.add(email.toLowerCase());

      const existing = await prisma.user.findUnique({
        where: { email: email.trim() },
      });
      if (existing) {
        errors.push({ row: rowNum, email, message: "이미 등록된 이메일입니다." });
        continue;
      }

      const roleRaw = toStr(row["역할"] ?? row["role"] ?? row["Role"]).toUpperCase();
      const role = roleRaw === "TEAM_LEAD" ? "TEAM_LEAD" : "USER";
      const phone = toStr(row["연락처"] ?? row["phone"] ?? row["Phone"]) || null;
      const workPhone = toStr(row["업무 연락처"] ?? row["workPhone"] ?? row["WorkPhone"]) || null;
      const workEmail = toStr(row["업무 이메일"] ?? row["workEmail"] ?? row["WorkEmail"]) || null;
      const bankAccount = toStr(row["은행계좌번호"] ?? row["통장번호"] ?? row["bankAccount"] ?? row["BankAccount"]) || null;
      const address = toStr(row["주소지"] ?? row["address"] ?? row["Address"]) || null;
      const residentId = toStr(row["주민번호"] ?? row["residentId"] ?? row["ResidentId"]) || null;
      const department = toStr(row["부서"] ?? row["department"] ?? row["Department"]) || null;
      const position = toStr(row["직책"] ?? row["position"] ?? row["Position"]) || null;
      const joinDateInput = toStr(row["입사일"] ?? row["joinDate"] ?? row["JoinDate"]);
      const joinDate = parseDate(joinDateInput) ?? new Date();

      try {
        const hashedPassword = await hash(password, 10);
        await prisma.user.create({
          data: {
            email: email.trim(),
            password: hashedPassword,
            name: name.trim(),
            role,
            phone,
            workPhone,
            workEmail,
            bankAccount,
            address,
            residentId,
            department,
            position,
            joinDate,
          },
        });
        created.push({ email, name });
      } catch (e) {
        errors.push({
          row: rowNum,
          email,
          message: e instanceof Error ? e.message : "등록 실패",
        });
      }
    }

    if (created.length > 0) {
      revalidateTag("users-list", "max");
    }

    return NextResponse.json({
      created: created.length,
      failed: errors.length,
      createdList: created,
      errors,
    });
  } catch (e) {
    console.error("Users import error:", e);
    const message = e instanceof Error ? e.message : "엑셀 업로드에 실패했습니다.";
    return NextResponse.json(
      { error: "엑셀 업로드에 실패했습니다.", details: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}
