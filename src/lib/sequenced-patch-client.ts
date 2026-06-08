/**
 * 본문 PATCH 자동저장용: in-flight 요청 abort + generation 검증으로
 * 늦게 도착한 구 응답이 최신 상태를 덮어쓰지 않게 한다.
 */
export type SequencedPatchResult =
  | { ok: true; updatedAt?: string }
  | {
      ok: false;
      reason: "aborted" | "superseded" | "error" | "conflict";
      error?: Error;
      serverUpdatedAt?: string;
    };

export type SequencedPatchOptions = {
  /** 탭 닫기 등 beforeunload 시 마지막 변경 전송 */
  keepalive?: boolean;
  /** 다탭·다기기 충돌 검증용 — 서버 updatedAt과 불일치 시 409 */
  expectedUpdatedAt?: string | null;
};

export function createSequencedDescriptionPatcher(buildRequest: () => {
  url: string;
  headers: HeadersInit;
}) {
  let generation = 0;
  let abortController: AbortController | null = null;

  const patch = async (
    description: string | null,
    options?: SequencedPatchOptions
  ): Promise<SequencedPatchResult> => {
    abortController?.abort();
    const gen = ++generation;
    const ac = new AbortController();
    abortController = ac;
    const { url, headers } = buildRequest();
    const payload: { description: string | null; expectedUpdatedAt?: string } = { description };
    if (options?.expectedUpdatedAt) {
      payload.expectedUpdatedAt = options.expectedUpdatedAt;
    }
    try {
      const res = await fetch(url, {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify(payload),
        signal: ac.signal,
        keepalive: options?.keepalive,
      });
      if (gen !== generation) return { ok: false, reason: "superseded" };
      const json = (await res.json().catch(() => ({}))) as {
        updatedAt?: string;
        message?: string;
        serverUpdatedAt?: string;
      };
      if (res.status === 409) {
        return {
          ok: false,
          reason: "conflict",
          error: new Error(
            json.message ?? "다른 곳에서 본문이 수정되었습니다. 새로고침 후 다시 시도해 주세요."
          ),
          serverUpdatedAt: json.serverUpdatedAt,
        };
      }
      if (!res.ok) {
        return {
          ok: false,
          reason: "error",
          error: new Error(json.message ?? "저장 실패"),
        };
      }
      return { ok: true, updatedAt: json.updatedAt };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return { ok: false, reason: "aborted" };
      }
      if (gen !== generation) return { ok: false, reason: "superseded" };
      return {
        ok: false,
        reason: "error",
        error: e instanceof Error ? e : new Error("저장 실패"),
      };
    }
  };

  return { patch };
}
