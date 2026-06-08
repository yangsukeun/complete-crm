import { describe, expect, it, vi } from "vitest";
import { createSequencedDescriptionPatcher } from "@/lib/sequenced-patch-client";

/** 수정 전 performSave와 동일: abort·generation 없이 완료 순서대로 lastSaved 덮어씀 */
async function simulateOldAutosaveRace() {
  const lastSaved = { current: null as string | null };

  const fetchMock = (description: string, delayMs: number) =>
    new Promise<Response>((resolve) => {
      setTimeout(() => {
        lastSaved.current = description;
        resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }, delayMs);
    });

  const short = "SHORT_SNAPSHOT";
  const long = "LONG_SNAPSHOT_WITH_MORE_CONTENT";

  await Promise.all([fetchMock(short, 80), fetchMock(long, 10)]);

  return { lastSaved: lastSaved.current, short, long };
}

describe("재현법 1 — out-of-order PATCH", () => {
  it("수정 전: 늦게 완료된 구 스냅샷이 최신을 덮어쓴다 (소실 재현)", async () => {
    const { lastSaved, short, long } = await simulateOldAutosaveRace();
    expect(lastSaved).toBe(short);
    expect(lastSaved).not.toBe(long);
  });

  it("수정 후: 시퀀서가 구 요청을 abort하고 최신 스냅샷만 반영한다", async () => {
    const persisted: string[] = [];
    let callIndex = 0;

    const fetchSpy = vi.fn((_url: string, init?: RequestInit) => {
      callIndex += 1;
      const body = JSON.parse(String(init?.body)).description as string;
      const signal = init?.signal;

      if (callIndex === 1) {
        return new Promise<Response>((_resolve, reject) => {
          const timer = setTimeout(() => {
            persisted.push(body);
            _resolve(new Response("{}", { status: 200 }));
          }, 120);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }

      persisted.push(body);
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    vi.stubGlobal("fetch", fetchSpy);

    try {
      const patcher = createSequencedDescriptionPatcher(() => ({
        url: "/api/tasks/t1",
        headers: { "Content-Type": "application/json" },
      }));

      const rShort = patcher.patch("SHORT_SNAPSHOT");
      const rLong = patcher.patch("LONG_SNAPSHOT_WITH_MORE_CONTENT");
      const [shortResult, longResult] = await Promise.all([rShort, rLong]);

      expect(longResult.ok).toBe(true);
      expect(shortResult.ok).toBe(false);
      expect(shortResult.ok === false && shortResult.reason).toBe("aborted");
      expect(persisted).toEqual(["LONG_SNAPSHOT_WITH_MORE_CONTENT"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
