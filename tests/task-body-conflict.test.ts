import { describe, expect, it, vi, afterEach } from "vitest";
import { createSequencedDescriptionPatcher } from "@/lib/sequenced-patch-client";

describe("재현법 2 — updatedAt 충돌 검증", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("서버 409 시 conflict로 처리하고 덮어쓰지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: "conflict",
              message: "다른 곳에서 본문이 수정되었습니다. 새로고침 후 다시 시도해 주세요.",
              serverUpdatedAt: "2026-06-05T12:00:00.000Z",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } }
          )
        )
      )
    );

    const patcher = createSequencedDescriptionPatcher(() => ({
      url: "/api/tasks/t1",
      headers: { "Content-Type": "application/json" },
    }));

    const result = await patcher.patch("BODY", {
      expectedUpdatedAt: "2026-06-05T11:00:00.000Z",
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toBe("conflict");
      expect(result.serverUpdatedAt).toBe("2026-06-05T12:00:00.000Z");
    }
  });
});
