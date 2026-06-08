import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

/** ContentBodyEditor·TaskBodyEditor 공통 패턴: unmount 시 디바운스만 취소 vs flush 후 emit */
describe("재현법 3 — 디바운스 flush", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("수정 전(취소만): unmount 시 대기 중 변경이 부모 state에 반영되지 않는다", () => {
    const DEBOUNCE_MS = 800;
    let parentState = "initial";
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const schedule = (value: string) => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        parentState = value;
      }, DEBOUNCE_MS);
    };

    schedule("latest-edit");
    // unmount — 기존 ContentBodyEditor cleanup
    if (debounce) clearTimeout(debounce);

    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(parentState).toBe("initial");
  });

  it("수정 후(flush): unmount 전 emit을 호출하면 최신 변경이 반영된다", () => {
    const DEBOUNCE_MS = 1500;
    let parentState = "initial";
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let editorSnapshot = "latest-edit";

    const emit = () => {
      parentState = editorSnapshot;
    };

    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        emit();
      }, DEBOUNCE_MS);
    };

    schedule();
    // flushPendingSave 패턴
    if (debounce) {
      clearTimeout(debounce);
      debounce = null;
    }
    emit();

    expect(parentState).toBe("latest-edit");
  });
});
