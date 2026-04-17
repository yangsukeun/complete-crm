/** 게시판(자료) 새 글 뱃지 — 마지막으로 목록을 본 시각 (브라우저 로컬) */
export const BOARD_LAST_SEEN_LS_KEY = "crm:boardLastSeenAt";

export const BOARD_LAST_SEEN_EVENT = "board-last-seen-updated";

/** 자료실에 새 글이 등록됨 — 네비 뱃지 등에서 SWR 재검증용 */
export const BOARD_NEW_POST_EVENT = "board-new-post";

export function readBoardLastSeenIso(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BOARD_LAST_SEEN_LS_KEY);
}

/** 최초 없으면 현재 시각으로 두어, 과거 글에 뱃지가 쌓이지 않게 함 */
export function ensureBoardLastSeenBaseline(): string {
  if (typeof window === "undefined") return new Date(0).toISOString();
  const existing = localStorage.getItem(BOARD_LAST_SEEN_LS_KEY);
  if (existing) return existing;
  const now = new Date().toISOString();
  localStorage.setItem(BOARD_LAST_SEEN_LS_KEY, now);
  return now;
}

export function markBoardLastSeenNow(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(BOARD_LAST_SEEN_LS_KEY, new Date().toISOString());
  window.dispatchEvent(new CustomEvent(BOARD_LAST_SEEN_EVENT));
}
