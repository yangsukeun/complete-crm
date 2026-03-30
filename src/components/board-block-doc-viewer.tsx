"use client";

import { useEffect, useMemo, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { taskBodySchema } from "@/lib/task-body-schema";
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
  });

  const serialized = JSON.stringify(blocks);
  /** 같은 본문인데 부모 리마운트·참조만 바뀌는 경우 replaceBlocks 반복 → React #185 방지 */
  const lastSerializedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editor || !hasBlocks) return;
    if (lastSerializedRef.current === serialized) return;
    lastSerializedRef.current = serialized;
    try {
      editor.replaceBlocks(editor.document, blocks as never);
    } catch (e) {
      console.error("[BoardBlockDocViewer] replaceBlocks failed", e);
      lastSerializedRef.current = null;
    }
  }, [editor, serialized, hasBlocks, blocks]);

  if (!hasBlocks) {
    return null;
  }

  return (
    <div className="board-bn-readonly rounded-lg border bg-muted/30 p-2 dark:border-border">
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
    </div>
  );
}
