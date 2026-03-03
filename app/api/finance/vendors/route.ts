import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  ownerName: z.string().min(1),
  contactPerson: z.string().optional(),
  category: z.string().min(1),
});

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const vendors = await prisma.vendor.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json(vendors);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "거래처 목록을 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const vendor = await prisma.vendor.create({
      data: {
        name: parsed.data.name,
        bankName: parsed.data.bankName,
        accountNumber: parsed.data.accountNumber,
        ownerName: parsed.data.ownerName,
        contactPerson: parsed.data.contactPerson ?? null,
        category: parsed.data.category,
      },
    });
    return NextResponse.json(vendor);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "거래처 등록에 실패했습니다." }, { status: 500 });
  }
}
