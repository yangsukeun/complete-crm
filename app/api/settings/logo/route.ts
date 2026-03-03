import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "logo");
const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];

export async function GET() {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      const company = await prisma.companyInfo.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { logoUrl: true },
      });
      return NextResponse.json({ logoUrl: company?.logoUrl ?? null });
    } catch (selectErr) {
      const msg = selectErr instanceof Error ? selectErr.message : "";
      if (msg.includes("Unknown column") || msg.includes("Unknown field") || msg.includes("logoUrl")) {
        return NextResponse.json({ logoUrl: null });
      }
      throw selectErr;
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "로고 정보를 불러올 수 없습니다." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "EXECUTIVE" && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "관리자만 로고를 변경할 수 있습니다." }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("logo");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "로고 이미지 파일을 선택하세요." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "JPEG, PNG, GIF, WebP, SVG 이미지만 등록할 수 있습니다." },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "파일 크기는 2MB 이하여야 합니다." }, { status: 400 });
    }

    const ext =
      file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/png"
          ? "png"
          : file.type === "image/gif"
            ? "gif"
            : file.type === "image/svg+xml"
              ? "svg"
              : "webp";
    const filename = `logo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    try {
      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }
      const filepath = path.join(UPLOAD_DIR, filename);
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(filepath, buffer);
    } catch (fileErr) {
      console.error("[logo] file write error", fileErr);
      return NextResponse.json(
        { error: "로고 파일을 저장할 수 없습니다. public/uploads/logo 폴더 권한을 확인하세요." },
        { status: 500 }
      );
    }

    const url = `/uploads/logo/${filename}`;

    try {
      const existing = await prisma.companyInfo.findFirst({ orderBy: { updatedAt: "desc" } });
      if (existing) {
        await prisma.companyInfo.update({
          where: { id: existing.id },
          data: { logoUrl: url },
        });
      } else {
        await prisma.companyInfo.create({
          data: { name: "회사명", logoUrl: url },
        });
      }
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : "";
      if (msg.includes("Unknown column") || msg.includes("Unknown field") || msg.includes("logoUrl")) {
        return NextResponse.json(
          {
            error:
              "로고 파일은 저장되었으나 DB에 반영되지 않았습니다. 터미널에서 'npx prisma db push'를 실행한 뒤 다시 시도하세요.",
            url,
          },
          { status: 503 }
        );
      }
      console.error("[logo] db error", dbErr);
      return NextResponse.json({ error: "로고 정보 저장에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ url });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "로고 등록에 실패했습니다." }, { status: 500 });
  }
}
