import { NextResponse, after } from "next/server";
import { getAppSession } from "@/auth";
import { storeUploadedFile, resolveStorageProvider } from "@/lib/storage";
import {
  grantDriveAnyoneWithLinkRead,
  parseGoogleDriveFileIdFromUrl,
} from "@/lib/storage/google-drive-storage";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Google Drive 등 가벼운 저장 경로 기준 (초과 시 NAS 등 별도 연동 예정) */
const MAX_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
  "image/heic",
  "image/heif",
];
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
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/html",
  "application/x-hwp",
  "application/haansofthwp",
  "application/vnd.hancom.hwp",
  "application/vnd.hancom.hwpx",
  "application/vnd.hancom.hwpml.document",
  "application/x-hwpml",
  /** 압축·아카이브 (ZIP은 브라우저/ OS마다 MIME 이 다름) */
  "application/zip",
  "application/x-zip-compressed",
  "multipart/x-zip",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/x-compressed",
  /** 표·데이터 */
  "text/csv",
  "application/csv",
  "text/comma-separated-values",
];

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "html",
  "htm",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "avif",
  "heic",
  "heif",
  "mp4",
  "webm",
  "ogg",
  "mov",
  "m4v",
  "avi",
  "hwp",
  "hwpx",
  "zip",
  "rar",
  "7z",
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
    "image/bmp": "bmp",
    "image/avif": "avif",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/x-hwp": "hwp",
    "application/haansofthwp": "hwp",
    "application/vnd.hancom.hwp": "hwp",
    "application/vnd.hancom.hwpx": "hwpx",
    "application/vnd.hancom.hwpml.document": "hwpx",
    "application/x-hwpml": "hwpx",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
    "multipart/x-zip": "zip",
    "application/x-rar-compressed": "rar",
    "application/vnd.rar": "rar",
    "application/x-7z-compressed": "7z",
    "text/csv": "csv",
    "application/csv": "csv",
    "text/comma-separated-values": "csv",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/html": "html",
    "text/plain": "txt",
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
      return NextResponse.json(
        {
          error:
            "파일은 100MB 이하만 업로드할 수 있습니다. 대용량 파일은 추후 NAS 연동 예정입니다.",
        },
        { status: 400 }
      );
    }
    const mime = (file.type || "").toLowerCase() || "application/octet-stream";
    const extFromName =
      (file.name || "").split(".").pop()?.toLowerCase()?.replace(/[^a-z0-9]/g, "") || "";
    /** HWP/ZIP 등은 MIME 이 application/octet-stream 인 경우가 많아 확장자를 우선 신뢰 */
    const allowedByExt = Boolean(extFromName && ALLOWED_EXTENSIONS.has(extFromName));
    const allowedByMime = ALLOWED_IMAGE_TYPES.includes(mime) || ALLOWED_FILE_TYPES.includes(mime);
    if (!allowedByExt && !allowedByMime) {
      return NextResponse.json(
        {
          error:
            "지원 형식: 이미지, 동영상, PDF, Office, 한글(hwp/hwpx), 텍스트 등. (확장자: " +
            [...ALLOWED_EXTENSIONS].slice(0, 12).join(", ") +
            " 등)",
        },
        { status: 400 }
      );
    }

    const fileExt = getExt(mime, file.name);
    const filename = `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${fileExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const provider = resolveStorageProvider();
    if (provider === "vercel-blob" && !process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
      if (process.env.VERCEL) {
        return NextResponse.json(
          {
            error:
              "배포 환경에서 파일 저장소가 설정되지 않았습니다. Google Drive(GOOGLE_DRIVE_FOLDER_ID + 서비스 계정) 또는 BLOB_READ_WRITE_TOKEN, 또는 NAS(WebDAV)를 설정하세요. README의 파일 저장소 절을 참고하세요.",
          },
          { status: 503 }
        );
      }
    }

    const result = await storeUploadedFile({
      buffer,
      filename,
      mime,
      originalName: file.name,
    });

    /** Drive 업로드 시 링크 공개 읽기 — after()로 응답 후 실행해 업로드 레이턴시 단축 */
    if (result.provider === "google-drive") {
      const fid = parseGoogleDriveFileIdFromUrl(result.url);
      if (fid) after(() => grantDriveAnyoneWithLinkRead(fid));
    }

    return NextResponse.json({
      url: result.url,
      name: result.name,
      provider: result.provider,
      ...(result.mirrorWarning ? { mirrorWarning: result.mirrorWarning } : {}),
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "업로드에 실패했습니다.";
    return NextResponse.json({ error: msg.length < 400 ? msg : "업로드에 실패했습니다." }, { status: 500 });
  }
}
