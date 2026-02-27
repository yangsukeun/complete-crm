import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

export type QuotationFormItem = { description: string; quantity: number; unitPrice: number };

/** 견적서 폼 목록 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const forms = await prisma.quotationForm.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      select: { id: true, name: true, itemsJson: true, sortOrder: true, createdAt: true },
    });
    const list = forms.map((f: any) => ({
      id: f.id,
      name: f.name,
      items: parseItemsJson(f.itemsJson),
      sortOrder: f.sortOrder,
      createdAt: f.createdAt,
    }));
    return NextResponse.json(list);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "견적서 폼 목록을 불러올 수 없습니다." }, { status: 500 });
  }
}

/** 견적서 폼 추가 - 관리자(대표/임원)만 가능 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = session.user.role as string | undefined;
    if (role !== "EXECUTIVE" && role !== "ADMIN") {
      return NextResponse.json({ error: "견적서 폼 추가는 관리자(대표/임원)만 가능합니다." }, { status: 403 });
    }
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "폼명을 입력하세요." }, { status: 400 });
    }
    const items = Array.isArray(body.items) ? body.items : [];
    const validItems = items
      .filter(
        (i: unknown) =>
          i &&
          typeof i === "object" &&
          "description" in i &&
          (typeof (i as { quantity?: number }).quantity === "number" || (i as { quantity?: number }).quantity === undefined) &&
          (typeof (i as { unitPrice?: number }).unitPrice === "number" || (i as { unitPrice?: number }).unitPrice === undefined)
      )
      .map((i: any) => ({
        description: String(i.description ?? "").trim() || "(품목)",
        quantity: Number((i.quantity ?? 1)) || 0,
        unitPrice: Number((i.unitPrice ?? 0)) || 0,
      }));
    const itemsJson = JSON.stringify(validItems.length ? validItems : [{ description: "", quantity: 1, unitPrice: 0 }]);

    const maxOrder = await prisma.quotationForm
      .aggregate({ _max: { sortOrder: true } })
      .then((r: any) => (r?._max?.sortOrder ?? -1));

    const form = await prisma.quotationForm.create({
      data: {
        name,
        itemsJson,
        sortOrder: maxOrder + 1,
      },
    });
    return NextResponse.json({ id: form.id, name: form.name });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "견적서 폼 추가에 실패했습니다." }, { status: 500 });
  }
}

function parseItemsJson(json: string): QuotationFormItem[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((i: any) => ({
      description: typeof (i as { description?: string })?.description === "string" ? (i as { description: string }).description : "",
      quantity: typeof (i as { quantity?: number })?.quantity === "number" ? (i as { quantity: number }).quantity : 1,
      unitPrice: typeof (i as { unitPrice?: number })?.unitPrice === "number" ? (i as { unitPrice: number }).unitPrice : 0,
    }));
  } catch {
    return [];
  }
}
