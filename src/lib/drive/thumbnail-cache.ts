/** 탐색기 썸네일 서버 메모리 캐시 (웜 인스턴스 재사용). */

type ThumbCacheEntry = {
  body: Buffer;
  contentType: string;
  expiresAt: number;
};

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 250;
const store = new Map<string, ThumbCacheEntry>();

export function getCachedExplorerThumbnail(
  key: string
): { body: Buffer; contentType: string } | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  // LRU: re-insert
  store.delete(key);
  store.set(key, hit);
  return { body: hit.body, contentType: hit.contentType };
}

export function setCachedExplorerThumbnail(
  key: string,
  body: Buffer,
  contentType: string
): void {
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  store.set(key, {
    body,
    contentType,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function explorerThumbnailCacheKey(fileDbId: string, w: number): string {
  return `${fileDbId}:${w}`;
}
