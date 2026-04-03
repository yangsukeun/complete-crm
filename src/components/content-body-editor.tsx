"use client";

import { useCallback, useEffect, useRef, useMemo } from "react";
import { combineByGroup } from "@blocknote/core";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import {
  useCreateBlockNote,
  useBlockNoteEditor,
  FormattingToolbar,
  FormattingToolbarController,
  SideMenu,
  SideMenuController,
  AddBlockButton,
  DragHandleButton,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteMantineShell } from "@/components/blocknote-mantine-shell";
import { ko } from "@blocknote/core/locales";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { taskBodySchema } from "@/lib/task-body-schema";
import { parseStoredTaskBody, serializeTaskBodyForStore } from "@/lib/task-body-description";
import { normalizeBlockNoteBlocksForYoutube } from "@/lib/blocknote-normalize-youtube";
import {
  createPastedImageBlock,
  getClipboardImageFile,
  getFirstImageFileFromDataTransfer,
  isParagraphEffectivelyEmpty,
  uploadImageViaApi,
} from "@/lib/editor-image-upload";
import { UPLOAD_TOAST_DURATION_MS } from "@/lib/upload-client-validate";
import {
  extractUrlFromPlainPaste,
  isYoutubePastedUrl,
} from "@/lib/editor-paste-url-helpers";

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

/** `/` 메뉴: 기본 블록 + HTML 블록(코드·미리보기) */
function BoardContentSlashMenu() {
  const editor = useBlockNoteEditor();
  const getItems = useMemo(
    () => async (query: string) => {
      const htmlItem = {
        title: "HTML 블록",
        subtext: "HTML 코드 작성 및 미리보기",
        aliases: ["html", "HTML", "html block", "마크업", "웹"],
        group: "기본 블록",
        icon: <span className="text-base leading-none">🖥️</span>,
        onItemClick: () => {
          insertOrUpdateBlockForSlashMenu(editor, {
            type: "htmlBlock",
            props: { html: "" },
          } as never);
        },
      };
      const youtubeItem = {
        title: "YouTube 임베드",
        subtext: "URL 입력 또는 본문에 주소 한 줄 붙여넣기",
        aliases: ["youtube", "유튜브", "영상", "video", "embed"],
        group: "미디어",
        icon: <span className="text-base leading-none">▶️</span>,
        onItemClick: () => {
          const raw =
            typeof window !== "undefined"
              ? window.prompt(
                  "YouTube URL (취소하면 빈 블록만 추가)",
                  "https://www.youtube.com/watch?v="
                )
              : null;
          if (raw === null) return;
          const url = raw.trim();
          insertOrUpdateBlockForSlashMenu(editor, {
            type: "youtube",
            props: { url },
          } as never);
        },
      };
      const linkPreviewItem = {
        title: "링크 미리보기",
        subtext: "URL 입력 또는 일반 링크 한 줄 붙여넣기",
        aliases: ["link", "preview", "url", "링크", "미리보기"],
        group: "미디어",
        icon: <span className="text-base leading-none">🔗</span>,
        onItemClick: () => {
          const raw =
            typeof window !== "undefined"
              ? window.prompt("미리보기할 페이지 URL", "https://")
              : null;
          if (raw === null) return;
          const url = raw.trim();
          insertOrUpdateBlockForSlashMenu(editor, {
            type: "linkPreview",
            props: { url },
          } as never);
        },
      };
      return filterSuggestionItems(
        combineByGroup(getDefaultReactSlashMenuItems(editor), [
          youtubeItem,
          linkPreviewItem,
          htmlItem,
        ]),
        query
      );
    },
    [editor]
  );
  return <SuggestionMenuController triggerCharacter="/" getItems={getItems} />;
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
      const parsed = parseStoredTaskBody(raw);
      if (parsed?.format === "blocks" && Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
        editor.replaceBlocks(
          editor.document,
          normalizeBlockNoteBlocksForYoutube(parsed.blocks as unknown[]) as never
        );
        return;
      }
      const md = parsed?.format === "markdown" ? parsed.markdown : raw;
      const blocks = editor.tryParseMarkdownToBlocks(md);
      if (blocks.length > 0) {
        editor.replaceBlocks(editor.document, blocks);
      }
    } catch {
      // ignore
    }
  }, [editor, initialContent]);

  const emitChange = useCallback(() => {
    if (!editor) return;
    const stored = serializeTaskBodyForStore({
      document: editor.document,
      blocksToMarkdownLossy: (blocks) => editor.blocksToMarkdownLossy(blocks ?? editor.document),
    });
    onChangeRef.current(stored ?? "");
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
        if (imageFile) {
          e.preventDefault();
          e.stopPropagation();
          void toast.promise(insertUploadedImageAtCursor(imageFile), {
            loading: "이미지 업로드 중…",
            success: "이미지를 넣었습니다.",
            error: (err) => ({
              message: err instanceof Error ? err.message : "이미지 업로드 실패",
              duration: UPLOAD_TOAST_DURATION_MS,
            }),
          });
          return;
        }

        if (dt.files && dt.files.length > 0) return;

        const urlText = extractUrlFromPlainPaste(dt.getData("text/plain") ?? "");
        if (!urlText) return;

        e.preventDefault();
        e.stopPropagation();

        const block = isYoutubePastedUrl(urlText)
          ? { type: "youtube" as const, props: { url: urlText } }
          : { type: "linkPreview" as const, props: { url: urlText } };

        const cur = editor.getTextCursorPosition();
        const refBlock = cur?.block ?? editor.document[editor.document.length - 1];
        if (!refBlock) return;

        if (isParagraphEffectivelyEmpty(refBlock)) {
          editor.replaceBlocks([refBlock], [block as never]);
        } else {
          editor.insertBlocks([block as never], refBlock, "after");
        }
      } catch {
        /* ignore */
      }
    },
    [editor, insertUploadedImageAtCursor]
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
          error: (err) => ({
            message: err instanceof Error ? err.message : "이미지 업로드 실패",
            duration: UPLOAD_TOAST_DURATION_MS,
          }),
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
          "[&_.bn-html-block-wrapper]:min-w-0 [&_.html-block-preview]:max-h-[500px] [&_.html-block-preview]:overflow-y-auto",
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
        <div
          style={{ minHeight: minHeight || "280px" }}
          className="rounded-lg bg-white text-gray-900 [&_.bn-editor]:min-h-[inherit] [&_.bn-editor]:bg-white"
        >
          <BlockNoteMantineShell>
            <BlockNoteView
              editor={editor}
              theme="light"
              onChange={handleChange}
              formattingToolbar={false}
              sideMenu={false}
              slashMenu={false}
            >
              <BoardContentSlashMenu />
              <FormattingToolbarController
                formattingToolbar={() => <FormattingToolbar />}
              />
              <SideMenuController sideMenu={NotionStyleSideMenu} />
            </BlockNoteView>
          </BlockNoteMantineShell>
        </div>
      </div>
      {showHelp && (
        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          💡 텍스트 드래그 시 서식 툴바 | <kbd className="rounded border px-1 py-0.5 text-[10px]">/</kbd> 블록(YouTube·링크·HTML) |{" "}
          <strong>YouTube·일반 URL 한 줄 붙여넣기</strong> 시 임베드·미리보기 자동 삽입 | 이미지 드래그·붙여넣기
        </p>
      )}
    </div>
  );
}
