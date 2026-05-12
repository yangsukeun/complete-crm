"use client";

import { useEffect, useMemo, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteMantineShell } from "@/components/blocknote-mantine-shell";
import { taskBodySchema } from "@/lib/task-body-schema";
import { normalizeBlockNoteBlocksForYoutube } from "@/lib/blocknote-normalize-youtube";
import { BLOCKNOTE_TABLES_OPTIONS } from "@/lib/blocknote-table-options";
import { uploadImageViaApi } from "@/lib/editor-image-upload";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

type Props = {
  blocks: unknown[];
};

/** 게시글 본문 `__BN_DOC_V1__` JSON을 읽기 전용 BlockNote로 표시 */
export function BoardBlockDocViewer({ blocks }: Props) {
  const hasBlocks = Array.isArray(blocks) && blocks.length > 0;

  const uploadFile = useMemo(
    () => async (file: File) => uploadImageViaApi(file),
    []
  );

  const editor = useCreateBlockNote({
    schema: taskBodySchema,
    uploadFile,
    defaultStyles: true,
    tables: BLOCKNOTE_TABLES_OPTIONS,
  });

  const serialized = JSON.stringify(blocks);
  /** 같은 본문인데 부모 리마운트·참조만 바뀌는 경우 replaceBlocks 반복 → React #185 방지 */
  const lastSerializedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editor || !hasBlocks) return;
    if (lastSerializedRef.current === serialized) return;
    lastSerializedRef.current = serialized;
    try {
      editor.replaceBlocks(
        editor.document,
        normalizeBlockNoteBlocksForYoutube(blocks as unknown[]) as never
      );
    } catch (e) {
      console.error("[BoardBlockDocViewer] replaceBlocks failed", e);
      lastSerializedRef.current = null;
    }
  }, [editor, serialized, hasBlocks, blocks]);

  if (!hasBlocks) {
    return null;
  }

  return (
    <div className="board-bn-readonly w-full min-h-[min(88dvh,1600px)] rounded-lg border bg-white p-4 text-gray-900 dark:border-border [&_.bn-container]:min-h-[min(80dvh,1400px)] [&_.bn-editor]:min-h-[min(75dvh,1200px)]">
      <BlockNoteMantineShell>
        <BlockNoteView
          editor={editor}
          editable={false}
          theme="light"
          formattingToolbar={false}
          linkToolbar={false}
          slashMenu={false}
          sideMenu={false}
          filePanel={false}
          tableHandles={false}
        />
      </BlockNoteMantineShell>
      <style jsx global>{`
        .board-bn-readonly .bn-youtube-embed-wrapper iframe {
          width: 100% !important;
          max-width: 100%;
          aspect-ratio: 16 / 9;
          min-height: 200px;
          height: auto !important;
          border: 0;
        }
        .board-bn-readonly .bn-link-preview-wrapper img {
          display: block;
        }
      `}</style>
    </div>
  );
}
