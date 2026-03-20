import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getAppSession } from "@/auth";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "content");
const MAX_SIZE = 50 * 1024 * 1024; // 50MB (교육자료 동영상 등)
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-m4v",
];
const ALLOWED_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

// 브라우저가 MIME을 비우거나 octet-stream으로 보낼 때 확장자로 허용
const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "txt",
  "jpg", "jpeg", "png", "gif", "webp", "bmp",
  "mp4", "webm", "ogg", "mov", "m4v", "avi",
]);

function getExt(mime: string, fileName?: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/ogg": "ogg",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
    "video/x-m4v": "m4v",
  };
  if (map[mime]) return map[mime];
  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext && /^[a-z0-9]+$/.test(ext)) return ext;
  }
  return "bin";
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
      return NextResponse.json({ error: "파일 크기는 50MB 이하여야 합니다." }, { status: 400 });
    }
    const mime = (file.type || "").toLowerCase() || "application/octet-stream";
    const extFromName = (file.name || "").split(".").pop()?.toLowerCase()?.replace(/[^a-z0-9]/g, "") || "";
    const allowedByMime = ALLOWED_IMAGE_TYPES.includes(mime) || ALLOWED_FILE_TYPES.includes(mime);
    const allowedByExt = extFromName && ALLOWED_EXTENSIONS.has(extFromName);
    if (!allowedByMime && !allowedByExt) {
      return NextResponse.json(
        { error: "지원 형식: 이미지, 동영상(MP4/WebM/OGG/MOV 등), PDF, 문서, 텍스트. (확장자: " + [...ALLOWED_EXTENSIONS].slice(0, 10).join(", ") + " 등)" },
        { status: 400 }
      );
    }

    const fileExt = getExt(mime, file.name);
    const filename = `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${fileExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    /** Vercel 등 읽기 전용 FS: BLOB_READ_WRITE_TOKEN 설정 시 Vercel Blob 사용 */
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (blobToken) {
      const blob = await put(`board-content/${filename}`, buffer, {
        access: "public",
        token: blobToken,
        contentType: mime || undefined,
      });
      return NextResponse.json({ url: blob.url, name: file.name });
    }

    if (process.env.VERCEL) {
      return NextResponse.json(
        {
          error:
            "배포 환경에서 파일 저장을 쓰려면 Vercel Blob 토큰이 필요합니다. 프로젝트 → Storage → Connect, 또는 BLOB_READ_WRITE_TOKEN 환경 변수를 설정하세요.",
        },
        { status: 503 }
      );
    }

    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    const filepath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filepath, buffer);

    const url = `/uploads/content/${filename}`;
    return NextResponse.json({ url, name: file.name });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "업로드에 실패했습니다." }, { status: 500 });
  }
}
