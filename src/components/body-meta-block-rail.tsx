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
    if (!anchor || !editor?.document?.length) {
      setLayouts([]);
      setRailHeight(0);
      return;
    }

    const next = measureTopLevelBlockLayouts(anchor, editor.document);

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
      window.setTimeout(measure, 320);
    };

    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(anchor);
    const editorEl = anchor.querySelector(".bn-editor");
    if (editorEl) ro.observe(editorEl);
    const containerEl = anchor.querySelector(".bn-container");
    if (containerEl) ro.observe(containerEl);

    const mo = new MutationObserver(scheduleMeasure);
    mo.observe(anchor, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-expanded", "hidden"],
    });

    const onResize = () => scheduleMeasure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    anchor.addEventListener("click", scheduleMeasure, true);

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
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

/** 블록(행) 높이에 맞춰 우측 메타 오버레이 */
export function BodyMetaBlockRail({
  anchorRef,
  editor,
  documentMeta: _documentMeta,
  blockMetaMap,
  layoutTick,
  className,
}: Props) {
  const { layouts, railHeight } = useBlockRowLayouts(anchorRef, editor, layoutTick);

  const rowsWithMeta = layouts.filter((row) => blockMetaMap[row.blockId]);
  if (!editor || rowsWithMeta.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute right-0 top-0 z-[1] hidden w-[10.5rem] border-l border-border/35 bg-background/85 pl-2 backdrop-blur-[1px] sm:block sm:w-[11.5rem]",
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
            className="absolute left-0 right-0 flex items-start pr-1"
            style={{ top: row.top, minHeight: row.slotHeight }}
          >
            <BodyMetaColumnCompact {...blockMeta} className="w-full min-w-0" />
          </div>
        );
      })}
    </div>
  );
}
