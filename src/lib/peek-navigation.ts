import type { MouseEvent } from "react";

/** 노션식 ‘옆에서 보기’: 일반 왼쪽 클릭만 패널로 열고, ⌘/Ctrl/Shift/가운데 클릭은 브라우저 기본(새 탭 등) 유지 */
export function isPlainLeftClick(e: MouseEvent): boolean {
  return (
    e.button === 0 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey
  );
}
