import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "content");
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

function getExt(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };
  return map[mime] ?? "bin";
}

export async function POST(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "파일을 선택하세요." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "파일 크기는 10MB 이하여야 합니다." }, { status: 400 });
    }
    const mime = file.type || "application/octet-stream";
    const allowed = ALLOWED_IMAGE_TYPES.includes(mime) || ALLOWED_FILE_TYPES.includes(mime);
    if (!allowed) {
      return NextResponse.json(
        { error: "지원 형식: 이미지(JPEG/PNG/GIF/WebP), PDF, 문서, 텍스트 등." },
        { status: 400 }
      );
    }

    const ext = getExt(mime);
    const filename = `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    const filepath = path.join(UPLOAD_DIR, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    const url = `/uploads/content/${filename}`;
    return NextResponse.json({ url, name: file.name });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "업로드에 실패했습니다." }, { status: 500 });
  }
}
