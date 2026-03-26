/**
 * 에디터(클라이언트)용 이미지 업로드·Drive 표시 URL 정규화.
 * — uc?export=view 는 브라우저 img 요청 시 HTML 뷰어가 올 때가 많아 엑박 → thumbnail API 사용.
 */
import { parseGoogleDriveFileIdFromUrl } from "@/lib/google-drive-url-utils";
import { postUploadFile } from "@/lib/upload-client-validate";

export function normalizeDriveImageUrlForImgTag(url: string): string {
  const raw = String(url ?? "").trim();
  if (!raw || raw.startsWith("blob:") || raw.startsWith("data:")) return raw;
  const id = parseGoogleDriveFileIdFromUrl(raw);
  if (!id) return raw;
  if (/drive\.google\.com\/thumbnail\?/i.test(raw)) return raw;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`;
}

/** 클립보드에서 이미지 파일 추출 (캡처·파일 항목·image/* item) */
export function getClipboardImageFile(dt: DataTransfer): File | null {
  if (dt.files?.length) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      if (f?.type?.startsWith("image/")) return f;
    }
  }
  if (dt.items?.length) {
    for (let i = 0; i < dt.items.length; i++) {
      const it = dt.items[i];
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f && (f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name))) {
          return f;
        }
      }
      if (it.type?.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) return f;
      }
    }
  }
  return null;
}

export function getFirstImageFileFromDataTransfer(dt: DataTransfer): File | null {
  const clip = getClipboardImageFile(dt);
  if (clip) return clip;
  if (dt.files?.length) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      if (f?.type?.startsWith("image/")) return f;
    }
  }
  return null;
}

export async function uploadImageViaApi(file: File): Promise<string> {
  const { url } = await postUploadFile(file);
  return normalizeDriveImageUrlForImgTag(url);
}

export function isParagraphEffectivelyEmpty(block: {
  type?: string;
  content?: unknown;
} | null): boolean {
  if (!block || block.type !== "paragraph") return false;
  const c = block.content;
  if (c == null || (Array.isArray(c) && c.length === 0)) return true;
  if (!Array.isArray(c)) return false;
  return c.every((item: unknown) => {
    const it = item as { type?: string; text?: string };
    if (it?.type === "text") return !(String(it.text ?? "").trim());
    return false;
  });
}

export function createPastedImageBlock(url: string, fileName: string) {
  return {
    type: "image" as const,
    props: {
      url,
      name: fileName.replace(/\s+/g, "-") || "image.png",
      caption: "",
      showPreview: true,
    },
  };
}
