/**
 * /api/profile/me 단일 호출·짧은 TTL 캐시 (여러 컴포넌트 동시 마운트 시 중복 제거)
 */

const TTL_MS = 45_000;

let cached: { data: unknown; ts: number } | null = null;
let inFlight: Promise<
  | { ok: true; data: unknown }
  | { ok: false; status: number; data: unknown }
> | null = null;

export function clearProfileMeCache(): void {
  cached = null;
  inFlight = null;
}

export async function fetchProfileMeResult(
  force = false,
  init?: RequestInit
): Promise<
  { ok: true; data: unknown } | { ok: false; status: number; data: unknown }
> {
  const now = Date.now();
  if (!force && cached && now - cached.ts < TTL_MS) {
    return { ok: true, data: cached.data };
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = (async () => {
    try {
      const res = await fetch("/api/profile/me", {
        credentials: "include",
        cache: "no-store",
        ...init,
      });
      let body: unknown = {};
      try {
        body = await res.json();
      } catch {
        body = {};
      }
      if (res.ok) {
        cached = { data: body, ts: Date.now() };
        return { ok: true as const, data: body };
      }
      return { ok: false as const, status: res.status, data: body };
    } catch {
      return { ok: false as const, status: 0, data: {} };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** 선호 AI 등: 실패 시 null */
export async function fetchProfileMeCached(
  force = false,
  init?: RequestInit
): Promise<unknown | null> {
  const r = await fetchProfileMeResult(force, init);
  return r.ok ? r.data : null;
}
