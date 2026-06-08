/**
 * 본문 PATCH 자동저장용: in-flight 요청 abort + generation 검증으로
 * 늦게 도착한 구 응답이 최신 상태를 덮어쓰지 않게 한다.
 */
export type SequencedPatchResult =
  | { ok: true }
  | { ok: false; reason: "aborted" | "superseded" | "error"; error?: Error };

export type SequencedPatchOptions = {
  /** 탭 닫기 등 beforeunload 시 마지막 변경 전송 */
  keepalive?: boolean;
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
    try {
      const res = await fetch(url, {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify({ description }),
        signal: ac.signal,
        keepalive: options?.keepalive,
      });
      if (gen !== generation) return { ok: false, reason: "superseded" };
      if (!res.ok) {
        return { ok: false, reason: "error", error: new Error("저장 실패") };
      }
      return { ok: true };
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
