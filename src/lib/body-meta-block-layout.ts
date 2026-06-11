/** 우측 메타 레일 — 블록 DOM 위치 측정·겹침 방지 */

export type BlockRowLayout = {
  blockId: string;
  top: number;
  height: number;
  /** 메타 박스에 할당된 세로 공간 */
  slotHeight: number;
};

/** 접힌 토글 등 짧은 행용 컴팩트 메타 높이(px) */
export const BLOCK_META_SLOT_MIN_PX = 40;
const ROW_GAP_PX = 2;

function getEditorRoot(anchor: HTMLElement): HTMLElement {
  return (anchor.querySelector(".bn-editor") as HTMLElement | null) ?? anchor;
}

/** 최상위(문서 루트) 블록 outer인지 */
export function isTopLevelBlockOuter(outer: HTMLElement, editorRoot: Element): boolean {
  const parentGroup = outer.parentElement;
  if (!parentGroup?.classList.contains("bn-block-group")) return false;

  let host: Element | null = parentGroup.parentElement;
  while (host && host !== editorRoot) {
    if (host.classList.contains("bn-block-outer")) return false;
    if (host.classList.contains("bn-container") || host.classList.contains("ProseMirror")) {
      host = host.parentElement;
      continue;
    }
    if (host === editorRoot) return true;
    host = host.parentElement;
  }
  return host === editorRoot;
}

/** 문서 블록 id에 해당하는 최상위 outer (data-id·중첩 토글 자식 구분) */
export function findTopLevelBlockOuter(
  editorRoot: Element,
  blockId: string
): HTMLElement | null {
  for (const outer of editorRoot.querySelectorAll(".bn-block-outer")) {
    if (outer.getAttribute("data-id") !== blockId) continue;
    if (isTopLevelBlockOuter(outer as HTMLElement, editorRoot)) {
      return outer as HTMLElement;
    }
  }

  for (const el of editorRoot.querySelectorAll(`[data-id="${blockId}"]`)) {
    const outer = el.closest(".bn-block-outer");
    if (outer && isTopLevelBlockOuter(outer as HTMLElement, editorRoot)) {
      return outer as HTMLElement;
    }
  }

  return null;
}

export function relativeTopWithinAnchor(el: HTMLElement, anchor: HTMLElement): number {
  const anchorRect = anchor.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return elRect.top - anchorRect.top;
}

export function measureTopLevelBlockLayouts(
  anchor: HTMLElement,
  documentBlocks: Array<{ id: string }>
): BlockRowLayout[] {
  const editorRoot = getEditorRoot(anchor);
  const layouts: BlockRowLayout[] = [];

  for (const block of documentBlocks) {
    const outer = findTopLevelBlockOuter(editorRoot, block.id);
    if (!outer) continue;

    const rect = outer.getBoundingClientRect();
    const height = Math.max(outer.offsetHeight, rect.height);
    if (height < 1) continue;

    layouts.push({
      blockId: block.id,
      top: relativeTopWithinAnchor(outer, anchor),
      height,
      slotHeight: Math.max(height, BLOCK_META_SLOT_MIN_PX),
    });
  }

  return deOverlapMetaSlots(layouts);
}

/**
 * 메타 박스가 이전 메타와 겹칠 때만 아래로 밀기.
 * 블록 top이 이미 충분히 떨어져 있으면 그대로 유지.
 */
export function deOverlapMetaSlots(layouts: BlockRowLayout[]): BlockRowLayout[] {
  if (layouts.length === 0) return layouts;

  const sorted = [...layouts].sort((a, b) => a.top - b.top);
  const out: BlockRowLayout[] = [];
  let lastBottom = -ROW_GAP_PX;

  for (const row of sorted) {
    const slotHeight = row.slotHeight ?? Math.max(row.height, BLOCK_META_SLOT_MIN_PX);
    let top = row.top;

    if (top < lastBottom + ROW_GAP_PX) {
      top = lastBottom + ROW_GAP_PX;
    }

    out.push({ ...row, top, slotHeight });
    lastBottom = top + slotHeight;
  }

  return out;
}
