"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { BodyMetaColumnCompact } from "@/components/body-meta-line";
import type { BodyMetaProps } from "@/components/body-meta-line";
import {
  measureTopLevelBlockLayouts,
  type BlockRowLayout,
} from "@/lib/body-meta-block-layout";
import { cn } from "@/lib/utils";

type EditorForBlockLayout = {
  document: Array<{ id: string }>;
};

export type { BlockRowLayout };

export type BlockMetaEntry = {
  authorName?: string | null;
  editorName?: string | null;
  createdAtIso?: string | Date | null;
  updatedAtIso?: string | Date | null;
};

function useBlockRowLayouts(
  anchorRef: RefObject<HTMLElement | null>,
  editor: EditorForBlockLayout | null | undefined,
  tick: number
) {
  const [layouts, setLayouts] = useState<BlockRowLayout[]>([]);
  const [railHeight, setRailHeight] = useState(0);

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || !editor) {
      setLayouts([]);
      setRailHeight(0);
      return;
    }

    const docIds = new Set(editor.document.map((b) => b.id));
    const next = measureTopLevelBlockLayouts(anchor, docIds);

    setLayouts(next);
    const contentHeight = Math.max(anchor.offsetHeight, anchor.scrollHeight);
    const metaBottom =
      next.length > 0 ? Math.max(...next.map((r) => r.top + r.slotHeight)) : 0;
    setRailHeight(Math.max(contentHeight, metaBottom + 8));
  }, [anchorRef, editor]);

  useEffect(() => {
    measure();
  }, [measure, tick]);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !editor) return;

    const scheduleMeasure = () => {
      measure();
      window.requestAnimationFrame(measure);
      window.setTimeout(measure, 120);
    };

    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(anchor);
    const editorEl = anchor.querySelector(".bn-editor");
    if (editorEl) ro.observe(editorEl);

    const mo = new MutationObserver(scheduleMeasure);
    mo.observe(anchor, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-expanded", "hidden"],
    });

    const onResize = () => scheduleMeasure();
    window.addEventListener("resize", onResize);
    anchor.addEventListener("click", scheduleMeasure, true);

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", onResize);
      anchor.removeEventListener("click", scheduleMeasure, true);
    };
  }, [anchorRef, editor, measure]);

  return { layouts, railHeight, remeasure: measure };
}

type Props = {
  anchorRef: RefObject<HTMLElement | null>;
  editor: EditorForBlockLayout | null | undefined;
  documentMeta: BodyMetaProps;
  blockMetaMap: Record<string, BlockMetaEntry>;
  layoutTick: number;
  className?: string;
};

/** 블록(행) 높이에 맞춰 우측 메타를 한 줄씩 정렬 */
export function BodyMetaBlockRail({
  anchorRef,
  editor,
  documentMeta: _documentMeta,
  blockMetaMap,
  layoutTick,
  className,
}: Props) {
  const { layouts, railHeight } = useBlockRowLayouts(anchorRef, editor, layoutTick);

  if (!editor || layouts.length === 0) {
    return (
      <div
        className={cn(
          "hidden w-[10.5rem] shrink-0 border-l border-border/40 pl-3 sm:block sm:w-[11.5rem]",
          className
        )}
        aria-hidden
      />
    );
  }

  const rowsWithMeta = layouts.filter((row) => blockMetaMap[row.blockId]);
  if (rowsWithMeta.length === 0) {
    return (
      <div
        className={cn(
          "hidden w-[10.5rem] shrink-0 border-l border-border/40 pl-3 sm:block sm:w-[11.5rem]",
          className
        )}
        style={{ minHeight: railHeight > 0 ? railHeight : undefined }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={cn(
        "relative hidden w-[10.5rem] shrink-0 border-l border-border/40 pl-3 sm:block sm:w-[11.5rem]",
        className
      )}
      style={{ minHeight: railHeight > 0 ? railHeight : undefined }}
      aria-label="본문 블록별 작성·수정 정보"
    >
      {rowsWithMeta.map((row) => {
        const blockMeta = blockMetaMap[row.blockId]!;

        return (
          <div
            key={row.blockId}
            className="pointer-events-none absolute left-0 right-0 flex items-start pr-0.5"
            style={{ top: row.top, height: row.slotHeight }}
          >
            <BodyMetaColumnCompact
              {...blockMeta}
              className="w-full min-w-0 overflow-hidden"
            />
          </div>
        );
      })}
    </div>
  );
}
