/** 우측 메타 레일 — 블록 DOM 위치 측정·겹침 방지 */

export type BlockRowLayout = {
  blockId: string;
  top: number;
  height: number;
  /** 메타 박스에 할당된 세로 공간(겹침 방지) */
  slotHeight: number;
};

/** 접힌 토글 등 짧은 행에 맞춘 컴팩트 메타 최소 높이(px) */
export const BLOCK_META_SLOT_MIN_PX = 50;
const ROW_GAP_PX = 4;

/** 에디터 최상위 블록 outer만 수집 (중첩·숨김 자식 제외) */
export function collectTopLevelBlockOuters(anchor: HTMLElement): HTMLElement[] {
  const editorEl = anchor.querySelector(".bn-editor");
  if (!editorEl) return [];

  const out: HTMLElement[] = [];
  for (const child of Array.from(editorEl.children)) {
    if (child.classList.contains("bn-block-group")) {
      for (const outer of Array.from(child.children)) {
        if (outer.classList.contains("bn-block-outer")) {
          out.push(outer as HTMLElement);
        }
      }
      continue;
    }
    if (child.classList.contains("bn-block-outer")) {
      out.push(child as HTMLElement);
    }
  }
  return out;
}

export function relativeTopWithinAnchor(el: HTMLElement, anchor: HTMLElement): number {
  const anchorRect = anchor.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return elRect.top - anchorRect.top + anchor.scrollTop;
}

export function measureTopLevelBlockLayouts(
  anchor: HTMLElement,
  documentBlockIds: Set<string>
): BlockRowLayout[] {
  const layouts: BlockRowLayout[] = [];

  for (const outer of collectTopLevelBlockOuters(anchor)) {
    const blockId = outer.getAttribute("data-id");
    if (!blockId || !documentBlockIds.has(blockId)) continue;

    const height = outer.offsetHeight;
    if (height < 1) continue;

    layouts.push({
      blockId,
      top: relativeTopWithinAnchor(outer, anchor),
      height,
      slotHeight: Math.max(height, BLOCK_META_SLOT_MIN_PX),
    });
  }

  return deOverlapMetaSlots(layouts);
}

/** 메타 박스가 서로 겹치지 않도록 세로 슬롯 재배치 (블록 top은 유지, 최소 간격 보장) */
export function deOverlapMetaSlots(layouts: BlockRowLayout[]): BlockRowLayout[] {
  if (layouts.length === 0) return layouts;

  const sorted = [...layouts].sort((a, b) => a.top - b.top);
  let lastBottom = -ROW_GAP_PX;

  return sorted.map((row) => {
    const top = Math.max(row.top, lastBottom + ROW_GAP_PX);
    const slotHeight = row.slotHeight ?? Math.max(row.height, BLOCK_META_SLOT_MIN_PX);
    lastBottom = top + slotHeight;
    return { ...row, top, slotHeight };
  });
}
