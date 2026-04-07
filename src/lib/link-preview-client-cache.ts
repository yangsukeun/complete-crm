/** BlockNote 링크 미리보기: 동일 URL 중복 fetch·재렌더 폭주 방지 */

type Preview = {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

const TTL_MS = 3_600_000;
const store = new Map<string, { at: number; data: Preview | null }>();
const inflight = new Map<string, Promise<Preview | null>>();

export function fetchLinkPreviewCached(url: string): Promise<Preview | null> {
  const now = Date.now();
  const hit = store.get(url);
  if (hit && now - hit.at < TTL_MS) {
    return Promise.resolve(hit.data);
  }
  const pending = inflight.get(url);
  if (pending) return pending;

  const run = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
    .then(async (r) => {
      const data = r.ok ? ((await r.json()) as Preview) : null;
      store.set(url, { at: Date.now(), data });
      return data;
    })
    .catch(() => {
      store.set(url, { at: Date.now(), data: null });
      return null;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, run);
  return run;
}
