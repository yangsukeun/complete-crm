"use client";

import { useCallback, useEffect, useRef, useMemo } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { ko } from "@blocknote/core/locales";
import {
  FormattingToolbar,
  FormattingToolbarController,
  SideMenu,
  SideMenuController,
  AddBlockButton,
  DragHandleButton,
} from "@blocknote/react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { taskBodySchema } from "@/lib/task-body-schema";
import {
  createPastedImageBlock,
  getClipboardImageFile,
  getFirstImageFileFromDataTransfer,
  isParagraphEffectivelyEmpty,
  uploadImageViaApi,
} from "@/lib/editor-image-upload";

const DEBOUNCE_MS = 800;

const koreanDictionary = {
  ...ko,
  placeholders: {
    ...ko.placeholders,
    default: "내용을 입력하세요. '/' 를 누르면 토글·제목·목록을 넣을 수 있어요.",
    heading: "제목",
    toggleListItem: "토글을 켜거나 끌 내용",
    bulletListItem: "목록 항목",
    numberedListItem: "목록 항목",
    checkListItem: "할 일",
  },
};

function NotionStyleSideMenu() {
  return (
    <SideMenu>
      <AddBlockButton key="addBlockButton" />
      <DragHandleButton key="dragHandleButton" />
    </SideMenu>
  );
}

export type ContentBodyEditorProps = {
  initialContent: string | null;
  onChange: (markdown: string) => void;
  className?: string;
  minHeight?: string;
  showHelp?: boolean;
};

export function ContentBodyEditor({
  initialContent,
  onChange,
  className,
  minHeight = "280px",
  showHelp = true,
}: ContentBodyEditorProps) {
  /** 슬래시 이미지 블록·드래그 기본 경로도 동일: /api/upload → Drive면 thumbnail URL */
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    return uploadImageViaApi(file);
  }, []);

  const dictionary = useMemo(() => koreanDictionary, []);

  const editor = useCreateBlockNote({
    schema: taskBodySchema,
    uploadFile,
    dictionary,
    defaultStyles: true,
  });

  const loadedInitialRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!editor || loadedInitialRef.current) return;
    const raw = (initialContent ?? "").trim();
    loadedInitialRef.current = true;
    if (!raw) return;
    try {
      const blocks = editor.tryParseMarkdownToBlocks(raw);
      if (blocks.length > 0) {
        editor.replaceBlocks(editor.document, blocks);
      }
    } catch {
      // ignore
    }
  }, [editor, initialContent]);

  const emitChange = useCallback(() => {
    if (!editor) return;
    const markdown = editor.blocksToMarkdownLossy(editor.document);
    onChangeRef.current(markdown || "");
  }, [editor]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      emitChange();
    }, DEBOUNCE_MS);
  }, [emitChange]);

  const insertUploadedImageAtCursor = useCallback(
    async (file: File) => {
      const cur = editor.getTextCursorPosition();
      const refBlock = cur?.block ?? editor.document[editor.document.length - 1];
      if (!refBlock) throw new Error("삽입 위치를 찾을 수 없습니다.");
      const url = await uploadImageViaApi(file);
      const block = createPastedImageBlock(url, file.name || "image.png");
      if (isParagraphEffectivelyEmpty(refBlock)) {
        editor.replaceBlocks([refBlock], [block as never]);
      } else {
        editor.insertBlocks([block as never], refBlock, "after");
      }
    },
    [editor]
  );

  const handlePasteCapture = useCallback(
    (e: React.ClipboardEvent) => {
      try {
        const dt = e.clipboardData;
        if (!dt) return;
        const imageFile = getClipboardImageFile(dt);
        if (!imageFile) return;
        e.preventDefault();
        e.stopPropagation();
        void toast.promise(insertUploadedImageAtCursor(imageFile), {
          loading: "이미지 업로드 중…",
          success: "이미지를 넣었습니다.",
          error: (err) => (err instanceof Error ? err.message : "이미지 업로드 실패"),
        });
      } catch {
        /* ignore */
      }
    },
    [insertUploadedImageAtCursor]
  );

  const handleDropCapture = useCallback(
    (e: React.DragEvent) => {
      try {
        const file = getFirstImageFileFromDataTransfer(e.dataTransfer);
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        void toast.promise(insertUploadedImageAtCursor(file), {
          loading: "이미지 업로드 중…",
          success: "이미지를 넣었습니다.",
          error: (err) => (err instanceof Error ? err.message : "이미지 업로드 실패"),
        });
      } catch {
        /* ignore */
      }
    },
    [insertUploadedImageAtCursor]
  );

  return (
    <div className={cn("flex flex-col", className)}>
      <div
        className={cn(
          "notion-editor-wrapper notion-page-like rounded-lg relative isolate overflow-visible",
          "[&_.bn-editor]:px-3 [&_.bn-editor]:py-4 [&_.bn-editor]:overflow-visible",
          "[&_.bn-block-outer]:my-1 [&_.bn-block-content]:leading-relaxed",
          "[&_.bn-mantine]:border-0 [&_.bn-mantine]:bg-transparent [&_.bn-mantine]:rounded-lg [&_.bn-mantine]:overflow-visible",
          "[&_.bn-container]:overflow-visible",
          "[&_.bn-inline-content]:text-[15px] [&_.bn-inline-content]:leading-[1.7]",
          "[&_h1_.bn-inline-content]:text-2xl [&_h1_.bn-inline-content]:font-bold",
          "[&_h2_.bn-inline-content]:text-xl [&_h2_.bn-inline-content]:font-semibold",
          "[&_h3_.bn-inline-content]:text-lg [&_h3_.bn-inline-content]:font-medium",
          "[&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:text-violet-600",
          "[&_.bn-checkbox]:accent-violet-500"
        )}
        style={{ isolation: "isolate" }}
        onPasteCapture={handlePasteCapture}
        onDropCapture={handleDropCapture}
      >
        <div style={{ minHeight: minHeight || "280px" }} className="[&_.bn-editor]:min-h-[inherit]">
          <BlockNoteView
            editor={editor}
            theme="light"
            onChange={handleChange}
            formattingToolbar={false}
            sideMenu={false}
            slashMenu={true}
          >
            <FormattingToolbarController
              formattingToolbar={() => <FormattingToolbar />}
            />
            <SideMenuController sideMenu={NotionStyleSideMenu} />
          </BlockNoteView>
        </div>
      </div>
      {showHelp && (
        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          💡 텍스트 드래그 시 서식 툴바 | <kbd className="rounded border px-1 py-0.5 text-[10px]">/</kbd> 블록 메뉴 | 이미지 드래그·붙여넣기
        </p>
      )}
    </div>
  );
}
