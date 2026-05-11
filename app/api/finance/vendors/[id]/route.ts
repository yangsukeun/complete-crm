import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  bankName: z.string().min(1).optional(),
  accountNumber: z.string().min(1).optional(),
  ownerName: z.string().min(1).optional(),
  contactPerson: z.string().optional().nullable(),
  category: z.string().min(1).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const vendor = await prisma.vendor.findUnique({ where: { id } });
    if (!vendor) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(vendor);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "거래처를 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값이 올바르지 않습니다.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const vendor = await prisma.vendor.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json(vendor);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "거래처 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const usedCount = await prisma.paymentRequest.count({ where: { vendorId: id } });
    if (usedCount > 0) {
      return NextResponse.json(
        {
          error:
            "이 거래처로 등록된 결제 요청이 있어 삭제할 수 없습니다. 계좌·업체 정보는 「수정」으로 바꿀 수 있습니다.",
        },
        { status: 409 }
      );
    }
    await prisma.vendor.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "거래처 삭제에 실패했습니다." }, { status: 500 });
  }
}
