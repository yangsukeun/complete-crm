import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** 도장 이미지를 base64 데이터 URL로 DB에 저장 (서버리스 환경에서도 동작) */
export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "관리자만 업로드할 수 있습니다." }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("stamp");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "도장 이미지 파일을 선택하세요." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "JPEG, PNG, GIF, WebP 이미지만 등록할 수 있습니다." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "파일 크기는 2MB 이하여야 합니다." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mime = file.type;
    const dataUrl = `data:${mime};base64,${base64}`;

    const existing = await prisma.companyInfo.findFirst({ orderBy: { updatedAt: "desc" } });
    if (existing) {
      await prisma.companyInfo.update({
        where: { id: existing.id },
        data: { stampImageUrl: dataUrl },
      });
    } else {
      await prisma.companyInfo.create({
        data: { name: "회사명", stampImageUrl: dataUrl },
      });
    }

    return NextResponse.json({ url: dataUrl });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "도장 이미지 등록에 실패했습니다." }, { status: 500 });
  }
}
