import { TASK_BODY_DOC_PREFIX } from "@/lib/task-body-description";
import { parseGoogleDriveFileIdFromUrl } from "@/lib/google-drive-url-utils";

/** Drive 이미지는 썸네일 URL이 <img> 호환성이 좋음 (공개 읽기 권한 전제) */
export function normalizeDriveImageDisplayUrl(url: string): string {
  const raw = String(url ?? "").trim();
  if (!raw || raw.startsWith("blob:") || raw.startsWith("data:")) return raw;
  const id = parseGoogleDriveFileIdFromUrl(raw);
  if (!id) return raw;
  if (/drive\.google\.com\/thumbnail\?/i.test(raw) && raw.includes(`id=${id}`)) return raw;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`;
}

function walkBlocksForImageDriveIds(blocks: unknown[], out: Set<string>): void {
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const block = b as {
      type?: string;
      props?: { url?: string };
      children?: unknown[];
    };
    if (block.type === "image" && block.props?.url) {
      const id = parseGoogleDriveFileIdFromUrl(String(block.props.url));
      if (id) out.add(id);
    }
    if (Array.isArray(block.children) && block.children.length > 0) {
      walkBlocksForImageDriveIds(block.children, out);
    }
  }
}

/** 저장된 본문(JSON)에서 image 블록의 Google Drive 파일 ID 집합 */
export function collectDriveImageFileIdsFromTaskDescription(desc: string | null | undefined): Set<string> {
  const out = new Set<string>();
  const t = (desc ?? "").trim();
  if (!t.startsWith(TASK_BODY_DOC_PREFIX)) return out;
  try {
    const parsed = JSON.parse(t.slice(TASK_BODY_DOC_PREFIX.length)) as { blocks?: unknown[] };
    if (Array.isArray(parsed?.blocks)) walkBlocksForImageDriveIds(parsed.blocks, out);
  } catch {
    /* ignore */
  }
  return out;
}

export function normalizeImageBlocksDriveDisplayUrls(blocks: unknown[]): unknown[] {
  return blocks.map((b) => {
    if (!b || typeof b !== "object") return b;
    const block = b as {
      type?: string;
      props?: Record<string, unknown>;
      children?: unknown[];
    };
    const children = Array.isArray(block.children)
      ? normalizeImageBlocksDriveDisplayUrls(block.children)
      : block.children;
    if (block.type === "image" && block.props && typeof block.props.url === "string") {
      return {
        ...block,
        props: {
          ...block.props,
          url: normalizeDriveImageDisplayUrl(block.props.url),
        },
        children,
      };
    }
    return { ...block, children };
  });
}
