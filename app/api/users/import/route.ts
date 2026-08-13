import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { hash } from "bcryptjs";
import { getEmployeeManagerContext } from "@/lib/employee-admin-access-db";
import { fillEmptyString, shouldFillJoinDate } from "@/lib/employee-import-fill";
import { ensureAccrualsUpTo } from "@/lib/leave/ensure-accruals";

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
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const manager = await getEmployeeManagerContext(session.user.id);
    if (!manager?.ok) {
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
    const updated: { email: string; name: string }[] = [];
    const errors: { row: number; email?: string; message: string }[] = [];
    const emailSet = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

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

      if (emailSet.has(email.toLowerCase())) {
        errors.push({ row: rowNum, email, message: "같은 파일 내 중복 이메일입니다." });
        continue;
      }
      emailSet.add(email.toLowerCase());

      const phone = toStr(row["연락처"] ?? row["phone"] ?? row["Phone"]) || null;
      const workPhone = toStr(row["업무 연락처"] ?? row["workPhone"] ?? row["WorkPhone"]) || null;
      const workEmail = toStr(row["업무 이메일"] ?? row["workEmail"] ?? row["WorkEmail"]) || null;
      const bankAccount =
        toStr(row["은행계좌번호"] ?? row["통장번호"] ?? row["bankAccount"] ?? row["BankAccount"]) || null;
      const address = toStr(row["주소지"] ?? row["address"] ?? row["Address"]) || null;
      const residentId = toStr(row["주민번호"] ?? row["residentId"] ?? row["ResidentId"]) || null;
      const department = toStr(row["부서"] ?? row["department"] ?? row["Department"]) || null;
      const position = toStr(row["직책"] ?? row["position"] ?? row["Position"]) || null;
      const joinDateInput = toStr(row["입사일"] ?? row["joinDate"] ?? row["JoinDate"]);
      const joinDateParsed = parseDate(joinDateInput);
      const birthDateParsed = parseDate(row["생년월일"] ?? row["birthDate"] ?? row["BirthDate"]);

      const existing = await prisma.user.findFirst({
        where: { email: { equals: email.trim(), mode: "insensitive" } },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          workPhone: true,
          workEmail: true,
          bankAccount: true,
          address: true,
          residentId: true,
          birthDate: true,
          joinDate: true,
          createdAt: true,
        },
      });

      if (existing) {
        const data: {
          phone?: string;
          workPhone?: string;
          workEmail?: string;
          bankAccount?: string;
          address?: string;
          residentId?: string;
          birthDate?: Date;
          joinDate?: Date;
        } = {};
        const phoneFill = fillEmptyString(existing.phone, phone);
        const workPhoneFill = fillEmptyString(existing.workPhone, workPhone);
        const workEmailFill = fillEmptyString(existing.workEmail, workEmail);
        const bankFill = fillEmptyString(existing.bankAccount, bankAccount);
        const addressFill = fillEmptyString(existing.address, address);
        const residentFill = fillEmptyString(existing.residentId, residentId);
        if (phoneFill !== undefined) data.phone = phoneFill;
        if (workPhoneFill !== undefined) data.workPhone = workPhoneFill;
        if (workEmailFill !== undefined) data.workEmail = workEmailFill;
        if (bankFill !== undefined) data.bankAccount = bankFill;
        if (addressFill !== undefined) data.address = addressFill;
        if (residentFill !== undefined) data.residentId = residentFill;
        if (!existing.birthDate && birthDateParsed) data.birthDate = birthDateParsed;
        if (joinDateParsed && shouldFillJoinDate(existing.joinDate, existing.createdAt)) {
          data.joinDate = joinDateParsed;
        }

        try {
          if (Object.keys(data).length > 0) {
            await prisma.user.update({ where: { id: existing.id }, data });
          }
          if (data.joinDate) {
            await ensureAccrualsUpTo(existing.id);
          }
          updated.push({ email: existing.email, name: existing.name });
        } catch (e) {
          errors.push({
            row: rowNum,
            email,
            message: e instanceof Error ? e.message : "업데이트 실패",
          });
        }
        continue;
      }

      if (!password || password.length < 4) {
        errors.push({ row: rowNum, email, message: "비밀번호는 4자 이상 입력하세요." });
        continue;
      }

      const roleRaw = toStr(row["역할"] ?? row["role"] ?? row["Role"]).toUpperCase();
      const role = roleRaw === "TEAM_LEAD" ? "TEAM_LEAD" : "USER";
      const joinDate = joinDateParsed ?? new Date();

      try {
        const hashedPassword = await hash(password, 10);
        const createdUser = await prisma.user.create({
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
            birthDate: birthDateParsed,
          },
          select: { id: true },
        });
        await ensureAccrualsUpTo(createdUser.id);
        created.push({ email, name });
      } catch (e) {
        errors.push({
          row: rowNum,
          email,
          message: e instanceof Error ? e.message : "등록 실패",
        });
      }
    }

    if (created.length > 0 || updated.length > 0) {
      revalidateTag("users-list", "max");
    }

    return NextResponse.json({
      created: created.length,
      updated: updated.length,
      failed: errors.length,
      createdList: created,
      updatedList: updated,
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
