import { previewPlainTextForBoard } from "@/lib/board-body";
import { safeParseAttachments } from "@/lib/board-attachments";
import { getDriveThumbnailUrl } from "@/lib/google-drive-url";
import { parseGoogleDriveFileIdFromUrl } from "@/lib/google-drive-url-utils";
import { TASK_BODY_DOC_PREFIX, parseStoredTaskBody } from "@/lib/task-body-description";

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|avif)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i;
const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/i;

/** API/클라이언트 공통 유튜브 ID (blocknote-youtube 의존 없이 가벼움) */
export function extractYoutubeIdForListPreview(url: string): string | null {
  const u = String(url ?? "").trim();
  if (!u) return null;
  let m = u.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (m) return m[1]!;
  m = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i);
  if (m) return m[1]!;
  m = u.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i);
  if (m) return m[1]!;
  m = u.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/i);
  if (m) return m[1]!;
  const vMatch = u.match(/[?&]v=([a-zA-Z0-9_-]{11})(?:&|#|$)/i);
  if (vMatch) return vMatch[1]!;
  return null;
}

function youtubeThumb(url: string): string | null {
  const id = extractYoutubeIdForListPreview(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

function isLikelyImageUrl(url: string, name: string): boolean {
  if (IMAGE_EXT.test(url) || IMAGE_EXT.test(name)) return true;
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (BLOB_HOST.test(h) || h.endsWith("blob.vercel-storage.com")) return true;
    if (h.includes("googleusercontent.com") || h === "lh3.googleusercontent.com") return true;
  } catch {
    /* */
  }
  return !!parseGoogleDriveFileIdFromUrl(url);
}

function isLikelyVideoUrl(url: string, name: string): boolean {
  return VIDEO_EXT.test(url) || VIDEO_EXT.test(name);
}

function normalizeListThumbnailUrl(rawUrl: string, thumbSize = 400): string {
  const u = String(rawUrl ?? "").trim();
  if (!u) return u;
  if (parseGoogleDriveFileIdFromUrl(u)) return getDriveThumbnailUrl(u, thumbSize);
  return u;
}

type Attachment = { url: string; name: string };

function firstMediaFromAttachments(attachments: Attachment[]): {
  mediaType: "image" | "video";
  displayUrl: string;
  sourceUrl: string;
} | null {
  if (!attachments?.length) return null;

  for (const a of attachments) {
    const url = a.url || "";
    const name = a.name || "";
    const yt = youtubeThumb(url) || youtubeThumb(name);
    if (yt) return { mediaType: "image", displayUrl: yt, sourceUrl: url || name };
  }

  for (const a of attachments) {
    const url = a.url || "";
    const name = a.name || "";
    if (isLikelyImageUrl(url, name)) {
      return { mediaType: "image", displayUrl: normalizeListThumbnailUrl(url || name), sourceUrl: url || name };
    }
  }

  for (const a of attachments) {
    const url = a.url || "";
    const name = a.name || "";
    if (isLikelyVideoUrl(url, name)) {
      return { mediaType: "video", displayUrl: url, sourceUrl: url };
    }
  }

  return null;
}

function walkBlocksFirstMedia(blocks: unknown[]): { mediaType: "image" | "video"; url: string } | null {
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const block = b as {
      type?: string;
      props?: { url?: string };
      children?: unknown[];
    };
    const t = String(block.type ?? "");
    if (t === "youtube" && block.props?.url) {
      const thumb = youtubeThumb(String(block.props.url));
      if (thumb) return { mediaType: "image", url: thumb };
    }
    if (t === "image" && block.props?.url) {
      const u = String(block.props.url).trim();
      if (u) return { mediaType: "image", url: u };
    }
    if (t === "video" && block.props?.url) {
      const u = String(block.props.url).trim();
      if (u) return { mediaType: "video", url: u };
    }
    if (Array.isArray(block.children) && block.children.length) {
      const inner = walkBlocksFirstMedia(block.children);
      if (inner) return inner;
    }
  }
  return null;
}

function firstMediaFromDescription(
  description: string | null | undefined,
  contentType: string | null | undefined
): { mediaType: "image" | "video"; displayUrl: string; sourceUrl: string } | null {
  const s = (description ?? "").trim();
  if (!s) return null;

  const asDoc = parseStoredTaskBody(s);
  if (asDoc?.format === "blocks" && Array.isArray(asDoc.blocks)) {
    const hit = walkBlocksFirstMedia(asDoc.blocks);
    if (hit) {
      if (hit.mediaType === "image") {
        return {
          mediaType: "image",
          displayUrl: normalizeListThumbnailUrl(hit.url),
          sourceUrl: hit.url,
        };
      }
      return { mediaType: "video", displayUrl: hit.url, sourceUrl: hit.url };
    }
    return null;
  }

  const md = asDoc?.format === "markdown" ? asDoc.markdown : s;
  const head = md.slice(0, 24_000);
  const ytMatch = head.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s"'<>)\]]+/i);
  if (ytMatch) {
    const thumb = youtubeThumb(ytMatch[0]);
    if (thumb) return { mediaType: "image", displayUrl: thumb, sourceUrl: ytMatch[0] };
  }
  const imgMatch = head.match(/https?:\/\/[^\s"'<>)\]]+\.(?:png|jpe?g|gif|webp|bmp|avif)(?:\?[^\s"'<>)\]]*)?/i);
  if (imgMatch) {
    const u = imgMatch[0];
    return { mediaType: "image", displayUrl: normalizeListThumbnailUrl(u), sourceUrl: u };
  }

  if (contentType === "html" || /<img[^>]+\bsrc=/i.test(head)) {
    const m = /src=["']([^"']+)["']/i.exec(head);
    if (m?.[1]) {
      const u = m[1].trim();
      if (u) return { mediaType: "image", displayUrl: normalizeListThumbnailUrl(u), sourceUrl: u };
    }
  }

  return null;
}

export type BoardListPreview = {
  text: string;
  mediaType: "image" | "video" | null;
  /** 카드 `<Image>` / 메타데이터용 (드라이브는 썸네일 URL) */
  imageUrl: string | null;
  videoUrl: string | null;
};

/**
 * 목록 API용: 본문 전체는 내려주지 않고 미리보기 텍스트·대표 썸네일만 계산.
 */
export function buildBoardListPreview(
  description: string | null | undefined,
  contentType: string | null | undefined,
  attachmentsJson: string | null | undefined
): BoardListPreview {
  const attachments = safeParseAttachments(attachmentsJson);
  const text = previewPlainTextForBoard(description, 180, contentType ?? undefined);

  const fromAtt = firstMediaFromAttachments(attachments);
  if (fromAtt) {
    return {
      text,
      mediaType: fromAtt.mediaType,
      imageUrl: fromAtt.mediaType === "image" ? fromAtt.displayUrl : null,
      videoUrl: fromAtt.mediaType === "video" ? fromAtt.displayUrl : null,
    };
  }

  const fromDesc = firstMediaFromDescription(description, contentType);
  if (fromDesc) {
    return {
      text,
      mediaType: fromDesc.mediaType,
      imageUrl: fromDesc.mediaType === "image" ? fromDesc.displayUrl : null,
      videoUrl: fromDesc.mediaType === "video" ? fromDesc.displayUrl : null,
    };
  }

  return { text, mediaType: null, imageUrl: null, videoUrl: null };
}

/** 클라이언트 폴백용: 첨부만으로 미디어 추론 (구 API 응답 호환) */
export function getPreviewMediaFromAttachmentsClient(
  attachments: Attachment[],
  description?: string
): { type: "image" | "video"; url: string; name: string } | null {
  const attHit = firstMediaFromAttachments(attachments);
  if (attHit) {
    return {
      type: attHit.mediaType,
      url: attHit.mediaType === "image" ? attHit.displayUrl : attHit.displayUrl,
      name: "",
    };
  }
  const head = (description ?? "").trim().slice(0, 24_000);
  if (head.startsWith(TASK_BODY_DOC_PREFIX)) {
    try {
      const parsed = JSON.parse(head.slice(TASK_BODY_DOC_PREFIX.length)) as { blocks?: unknown[] };
      if (Array.isArray(parsed?.blocks)) {
        const hit = walkBlocksFirstMedia(parsed.blocks);
        if (hit) {
          if (hit.mediaType === "image") {
            return { type: "image", url: normalizeListThumbnailUrl(hit.url), name: "" };
          }
          return { type: "video", url: hit.url, name: "" };
        }
      }
    } catch {
      /* */
    }
  }
  const ytThumb = youtubeThumb(head);
  if (ytThumb) return { type: "image", url: ytThumb, name: "YouTube" };
  return null;
}
