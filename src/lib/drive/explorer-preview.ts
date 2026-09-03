import { inferUploadMimeType } from "@/lib/upload-policy";

/** 탐색기 미리보기용 고해상도 썸네일 (Google Drive =s1600) */
export const EXPLORER_PREVIEW_THUMB_WIDTH = 1600;

export function isExplorerImageFile(file: {
  name: string;
  mimeType?: string | null;
  isFolder?: boolean;
  uploading?: boolean;
  creating?: boolean;
}): boolean {
  if (file.isFolder || file.uploading || file.creating) return false;
  return inferUploadMimeType(file.name, file.mimeType).toLowerCase().startsWith("image/");
}

export function explorerImagePreviewUrl(fileId: string): string {
  return `/api/drive/thumbnail/${encodeURIComponent(fileId)}?w=${EXPLORER_PREVIEW_THUMB_WIDTH}`;
}

export function explorerPreviewNeighbors<T extends { id: string }>(
  files: T[],
  currentId: string
): { index: number; prev: T | null; next: T | null } {
  const index = files.findIndex((f) => f.id === currentId);
  if (index < 0 || files.length === 0) {
    return { index: -1, prev: null, next: null };
  }
  if (files.length === 1) {
    return { index, prev: null, next: null };
  }
  const prev = files[(index - 1 + files.length) % files.length] ?? null;
  const next = files[(index + 1) % files.length] ?? null;
  return { index, prev, next };
}
