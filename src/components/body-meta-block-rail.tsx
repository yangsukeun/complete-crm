"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { BodyMetaColumn, type BodyMetaProps } from "@/components/body-meta-line";
import { cn } from "@/lib/utils";

type EditorForBlockLayout = {
  document: Array<{ id: string }>;
};

export type BlockRowLayout = {
  blockId: string;
  top: number;
  height: number;
};

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

    const anchorRect = anchor.getBoundingClientRect();
    const next: BlockRowLayout[] = [];

    for (const block of editor.document) {
      const el = anchor.querySelector(`[data-id="${block.id}"]`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height < 1) continue;
      next.push({
        blockId: block.id,
        top: rect.top - anchorRect.top,
        height: rect.height,
      });
    }

    setLayouts(next);
    setRailHeight(Math.max(anchor.offsetHeight, anchor.scrollHeight));
  }, [anchorRef, editor]);

  useEffect(() => {
    measure();
  }, [measure, tick]);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !editor) return;

    const ro = new ResizeObserver(() => measure());
    ro.observe(anchor);

    const mo = new MutationObserver(() => measure());
    mo.observe(anchor, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    const onResize = () => measure();
    window.addEventListener("resize", onResize);

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", onResize);
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
  documentMeta,
  blockMetaMap,
  layoutTick,
  className,
}: Props) {
  const { layouts, railHeight } = useBlockRowLayouts(anchorRef, editor, layoutTick);

  if (!editor || layouts.length === 0) {
    return (
      <div
        className={cn(
          "text-muted-foreground hidden w-[10.5rem] shrink-0 border-l border-border/40 pl-3 sm:block sm:w-[11.5rem]",
          className
        )}
        aria-hidden
      >
        <BodyMetaColumn {...documentMeta} className="border-0 pl-0" />
      </div>
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
      {layouts.map((row) => {
        const blockMeta = blockMetaMap[row.blockId];
        if (!blockMeta) return null;

        return (
          <div
            key={row.blockId}
            className="absolute left-0 right-0 flex items-start pr-0.5"
            style={{ top: row.top, minHeight: row.height }}
          >
            <BodyMetaColumn
              {...blockMeta}
              className="w-full border-0 pl-0 text-[10px] [&_dl]:space-y-0.5 [&_dl]:leading-tight"
            />
          </div>
        );
      })}
    </div>
  );
}
