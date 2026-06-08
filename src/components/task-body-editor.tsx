"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useMemo,
} from "react";
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
import {
  withMultiColumn,
  multiColumnDropCursor,
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
} from "@blocknote/xl-multi-column";
import { LayoutGrid, User } from "lucide-react";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  extractUrlFromPlainPaste,
  isYoutubePastedUrl,
} from "@/lib/editor-paste-url-helpers";
import { taskBodySchema } from "@/lib/task-body-schema";
import { workspaceFetchHeaders } from "@/lib/workspace-fetch-headers";
import { parseStoredTaskBody, serializeTaskBodyForStore } from "@/lib/task-body-description";
import { normalizeImageBlocksDriveDisplayUrls } from "@/lib/task-body-drive-images";
import { normalizeBlockNoteBlocksForYoutube } from "@/lib/blocknote-normalize-youtube";
import { BLOCKNOTE_TABLES_OPTIONS } from "@/lib/blocknote-table-options";
import {
  createPastedImageBlock,
  getClipboardImageFile,
  getFirstImageFileFromDataTransfer,
  insertBlockAtDropCoords,
  insertBlockAtTextCursor,
  uploadImageViaApi,
} from "@/lib/editor-image-upload";
import { UPLOAD_TOAST_DURATION_MS } from "@/lib/upload-client-validate";
import { createSequencedDescriptionPatcher } from "@/lib/sequenced-patch-client";

const AUTO_SAVE_DEBOUNCE_MS = 1500;

// 한국어 사전 + 노션에 가까운 플레이스홀더 (일반 제목은 접히지 않음 — 접기는 / 토글·접을 수 있는 제목 사용)
const koreanDictionary = {
  ...ko,
  placeholders: {
    ...ko.placeholders,
    default:
      "내용을 입력하세요. '/' 블록 · '@' 동료 호출 · 줄 앞 # - [] 단축키를 쓸 수 있어요.",
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

/** / 메뉴: 기본 블록 + 2·3열(패키지) + 4·5·6열(커스텀), 최대 6열까지 */
function makeColumnListBlock(count: number) {
  return {
    type: "columnList" as const,
    children: Array.from({ length: count }, () => ({
      type: "column" as const,
      props: { width: 1 },
      children: [{ type: "paragraph" as const }],
    })),
  };
}

/** @ : 본문에서 동료 멘션 → 저장 시 알림 및 TaskMention 동기화 */
function TaskMentionMenu() {
  const editor = useBlockNoteEditor();
  const [users, setUsers] = useState<
    Array<{ id: string; name: string; email: string; department: string | null; position: string | null }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users/list")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setUsers(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const getItems = useMemo(
    () => async (query: string) => {
      const items = users.map((u) => ({
        title: u.name,
        subtext: [u.position, u.department, u.email].filter(Boolean).join(" · ") || u.email,
        aliases: [u.name, u.email, u.department ?? "", u.position ?? ""].filter(Boolean) as string[],
        group: "동료 호출",
        icon: (
          <User className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        ),
        onItemClick: () => {
          editor.insertInlineContent([
            { type: "userMention", props: { userId: u.id, label: u.name } },
            " ",
          ] as never);
        },
      }));
      return filterSuggestionItems(items, query);
    },
    [editor, users]
  );

  return <SuggestionMenuController triggerCharacter="@" getItems={getItems} />;
}

function TaskSlashMenu() {
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
      const wideCols = [4, 5, 6].map((n) => ({
        title: `${n}열`,
        subtext: `${n}개 열을 나란히 배치합니다. 블록을 옆 가장자리로 드래그하면 열을 더 나눌 수 있어요.`,
        aliases: [`${n}열`, `${n}칸`, "열 나누기", "칸", "columns", "column"],
        group: "기본 블록",
        icon: (
          <LayoutGrid
            className="size-[18px] shrink-0 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
        ),
        onItemClick: () => {
          insertOrUpdateBlockForSlashMenu(editor, makeColumnListBlock(n) as never);
        },
      }));
      return filterSuggestionItems(
        combineByGroup(
          getDefaultReactSlashMenuItems(editor),
          getMultiColumnSlashMenuItems(editor),
          [youtubeItem, linkPreviewItem, htmlItem],
          wideCols
        ),
        query
      );
    },
    [editor]
  );
  return <SuggestionMenuController triggerCharacter="/" getItems={getItems} />;
}

export type TaskBodyEditorHandle = {
  /** 디바운스 대기 중인 변경 + 미반영 편집을 즉시 저장 시도 */
  flushPendingSave: () => Promise<void>;
};

export type TaskBodyEditorProps = {
  taskId: string;
  initialDescription: string | null;
  /** 다탭 충돌 검증용 — 부모·with-tabs와 공유 ref */
  bodyVersionRef: React.MutableRefObject<string | null>;
  onSaved: () => void;
  className?: string;
};

export const TaskBodyEditor = forwardRef<TaskBodyEditorHandle, TaskBodyEditorProps>(
  function TaskBodyEditor(
    { taskId, initialDescription, bodyVersionRef, onSaved, className },
    ref
  ) {
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    return uploadImageViaApi(file);
  }, []);

  const dictionary = useMemo(
    () => ({
      ...koreanDictionary,
      multi_column: multiColumnLocales.ko,
    }),
    []
  );

  const editor = useCreateBlockNote({
    schema: withMultiColumn(taskBodySchema),
    uploadFile,
    dictionary,
    defaultStyles: true,
    dropCursor: multiColumnDropCursor,
    tables: BLOCKNOTE_TABLES_OPTIONS,
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const loadedForTaskIdRef = useRef<string | null>(null);
  /** 서버와 동기화된 직렬화 본문 — 동일 스냅샷이면 PATCH 생략(onChange·프리뷰 갱신 루프 방지) */
  const lastSavedSerializedRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const unmountedRef = useRef(false);
  const performSaveRef = useRef<
    (options?: { keepalive?: boolean; silent?: boolean }) => Promise<void>
  >(async () => {});
  const patcherRef = useRef(
    createSequencedDescriptionPatcher(() => ({
      url: `/api/tasks/${taskId}`,
      headers: workspaceFetchHeaders({ "Content-Type": "application/json" }),
    }))
  );

  useEffect(() => {
    patcherRef.current = createSequencedDescriptionPatcher(() => ({
      url: `/api/tasks/${taskId}`,
      headers: workspaceFetchHeaders({ "Content-Type": "application/json" }),
    }));
  }, [taskId]);

  useEffect(() => {
    loadedForTaskIdRef.current = null;
    lastSavedSerializedRef.current = null;
  }, [taskId]);

  useEffect(() => {
    if (!editor || !taskId) return;

    if (loadedForTaskIdRef.current === taskId) return;

    const raw = (initialDescription ?? "").trim();
    if (!raw) {
      loadedForTaskIdRef.current = taskId;
      try {
        lastSavedSerializedRef.current = serializeTaskBodyForStore(editor);
      } catch {
        lastSavedSerializedRef.current = null;
      }
      return;
    }

    // replaceBlocks는 React 렌더/useEffect 동기 구간에서 호출 시 flushSync 경고가 난다.
    // initialDescription은 deps에 넣지 않음 — 서버 재조회·부모 setTask만으로는 재적용하지 않음(onChange→저장 루프 차단).
    const apply = () => {
      try {
        const parsed = parseStoredTaskBody(raw);
        if (parsed?.format === "blocks" && parsed.blocks.length > 0) {
          const normalized = normalizeBlockNoteBlocksForYoutube(
            normalizeImageBlocksDriveDisplayUrls(parsed.blocks as unknown[]) as unknown[]
          ) as typeof parsed.blocks;
          editor.replaceBlocks(editor.document, normalized as typeof editor.document);
          loadedForTaskIdRef.current = taskId;
          window.setTimeout(() => {
            try {
              lastSavedSerializedRef.current = serializeTaskBodyForStore(editor);
            } catch {
              lastSavedSerializedRef.current = null;
            }
          }, 0);
          return;
        }
        if (parsed?.format === "blocks") {
          loadedForTaskIdRef.current = taskId;
          try {
            lastSavedSerializedRef.current = serializeTaskBodyForStore(editor);
          } catch {
            lastSavedSerializedRef.current = null;
          }
          return;
        }
        if (parsed?.format === "markdown") {
          const blocks = editor.tryParseMarkdownToBlocks(parsed.markdown);
          if (blocks.length > 0) {
            editor.replaceBlocks(editor.document, blocks);
          }
          loadedForTaskIdRef.current = taskId;
          window.setTimeout(() => {
            try {
              lastSavedSerializedRef.current = serializeTaskBodyForStore(editor);
            } catch {
              lastSavedSerializedRef.current = null;
            }
          }, 0);
        }
      } catch {
        // ignore parse/replace errors
      }
    };
    const id = window.setTimeout(apply, 0);
    return () => window.clearTimeout(id);
    // initialDescription은 의도적으로 제외 — taskId·에디터 준비 시점의 스냅샷만 적용
  }, [editor, taskId]);

  const performSave = useCallback(
    async (options?: { keepalive?: boolean; silent?: boolean }) => {
      if (!editor) return;
      let stored: string | null;
      try {
        stored = serializeTaskBodyForStore(editor);
      } catch {
        return;
      }
      if (stored == null) return;
      if (lastSavedSerializedRef.current === stored) return;
      if (!unmountedRef.current) setSaveStatus("saving");
      const result = await patcherRef.current.patch(stored, {
        keepalive: options?.keepalive,
        expectedUpdatedAt: bodyVersionRef.current,
      });
      if (result.ok === false) {
        if (result.reason === "conflict" && !options?.silent) {
          toast.error(
            result.error?.message ??
              "다른 곳에서 본문이 수정되었습니다. 새로고침 후 다시 시도해 주세요."
          );
        } else if (result.reason === "error" && !options?.silent) {
          toast.error("본문 자동 저장에 실패했습니다.");
        }
        if (!unmountedRef.current) setSaveStatus("idle");
        return;
      }
      if (result.updatedAt) {
        bodyVersionRef.current = result.updatedAt;
      }
      lastSavedSerializedRef.current = stored;
      if (!unmountedRef.current) {
        setSaveStatus("saved");
        onSavedRef.current();
        setTimeout(() => {
          if (!unmountedRef.current) setSaveStatus("idle");
        }, 2000);
      }
    },
    [editor, bodyVersionRef]
  );
  performSaveRef.current = performSave;

  const flushPendingSave = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await performSave();
  }, [performSave]);

  useImperativeHandle(ref, () => ({ flushPendingSave }), [flushPendingSave]);

  const flushPendingSaveRef = useRef(flushPendingSave);
  flushPendingSaveRef.current = flushPendingSave;

  useEffect(() => {
    unmountedRef.current = false;

    const onBeforeUnload = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void performSaveRef.current({ keepalive: true, silent: true });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      unmountedRef.current = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void flushPendingSaveRef.current();
    };
  }, [taskId]);

  const handleChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void performSave();
    }, AUTO_SAVE_DEBOUNCE_MS);
  }, [performSave]);

  /* 캡처 단계: 이미지 파일 → /api/upload 후 영구 URL 블록 삽입(blob URL 방지). URL만 붙일 때는 유튜브/링크 프리뷰 */
  const handlePasteCapture = useCallback(
    (e: React.ClipboardEvent) => {
      try {
        const dt = e.clipboardData;
        if (!dt) return;

        const imageFile = getClipboardImageFile(dt);
        if (imageFile) {
          e.preventDefault();
          e.stopPropagation();
          const cursorBlock = editor.getTextCursorPosition().block;
          void toast.promise(
            (async () => {
              const url = await uploadImageViaApi(imageFile);
              const block = createPastedImageBlock(url, imageFile.name || "pasted-image.png");
              insertBlockAtTextCursor(editor, block, cursorBlock);
            })(),
            {
              loading: "이미지 업로드 중…",
              success: "이미지를 넣었습니다.",
              error: (err) => ({
                message: err instanceof Error ? err.message : "이미지 업로드 실패",
                duration: UPLOAD_TOAST_DURATION_MS,
              }),
            }
          );
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

        insertBlockAtTextCursor(editor, block, editor.getTextCursorPosition().block);
      } catch {
        // ignore
      }
    },
    [editor]
  );

  const handleDropCapture = useCallback(
    (e: React.DragEvent) => {
      try {
        const file = getFirstImageFileFromDataTransfer(e.dataTransfer);
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        const { clientX, clientY } = e;
        void toast.promise(
          (async () => {
            const url = await uploadImageViaApi(file);
            const block = createPastedImageBlock(url, file.name || "image.png");
            insertBlockAtDropCoords(editor, block, clientX, clientY);
          })(),
          {
            loading: "이미지 업로드 중…",
            success: "이미지를 넣었습니다.",
            error: (err) => ({
              message: err instanceof Error ? err.message : "이미지 업로드 실패",
              duration: UPLOAD_TOAST_DURATION_MS,
            }),
          }
        );
      } catch {
        /* ignore */
      }
    },
    [editor]
  );

  return (
    <div className={cn("flex flex-col", className)}>
      {/* 노션처럼 본문 위는 최소 정보만 (저장 상태) */}
      <div className="mb-1 flex min-h-[22px] justify-end">
        {saveStatus === "saving" && (
          <span className="text-[11px] tabular-nums text-amber-600/90 animate-pulse">
            저장 중…
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="text-[11px] tabular-nums text-muted-foreground">저장됨</span>
        )}
      </div>

      <div
        className={cn(
          "notion-editor-wrapper notion-page-like",
          "relative isolate min-h-[min(60vh,520px)] overflow-visible rounded-md",
          "border-0 bg-transparent shadow-none",
          "[&_.bn-editor]:mx-0 [&_.bn-editor]:w-full [&_.bn-editor]:max-w-none [&_.bn-editor]:min-h-[280px] [&_.bn-editor]:px-0 [&_.bn-editor]:py-3 sm:[&_.bn-editor]:px-1",
          "[&_.bn-editor]:text-base",
          "[&_.bn-block-outer]:my-0.5 [&_.bn-block-content]:leading-[1.65]",
          "[&_.bn-mantine]:border-0 [&_.bn-mantine]:bg-transparent [&_.bn-mantine]:shadow-none",
          "[&_.bn-container]:overflow-visible",
          "[&_.bn-inline-content]:text-[16px] [&_.bn-inline-content]:leading-[1.65] [&_.bn-inline-content]:text-foreground/95",
          "[&_h1_.bn-inline-content]:text-[1.875rem] [&_h1_.bn-inline-content]:font-bold [&_h1_.bn-inline-content]:leading-tight [&_h1_.bn-inline-content]:pt-2 [&_h1_.bn-inline-content]:pb-1",
          "[&_h2_.bn-inline-content]:text-[1.5rem] [&_h2_.bn-inline-content]:font-semibold [&_h2_.bn-inline-content]:leading-snug [&_h2_.bn-inline-content]:pt-1.5 [&_h2_.bn-inline-content]:pb-0.5",
          "[&_h3_.bn-inline-content]:text-[1.25rem] [&_h3_.bn-inline-content]:font-semibold [&_h3_.bn-inline-content]:leading-snug [&_h3_.bn-inline-content]:pt-1 [&_h3_.bn-inline-content]:pb-0.5",
          "[&_p]:my-[3px] [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0",
          "[&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.9em]",
          "[&_.bn-checkbox]:accent-primary",
          "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2"
        )}
        style={{ isolation: "isolate" }}
        onPasteCapture={handlePasteCapture}
        onDropCapture={handleDropCapture}
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
            <TaskMentionMenu />
            <TaskSlashMenu />
            <FormattingToolbarController formattingToolbar={() => <FormattingToolbar />} />
            <SideMenuController sideMenu={NotionStyleSideMenu} />
          </BlockNoteView>
        </BlockNoteMantineShell>
      </div>

      <style jsx global>{`
        .notion-editor-wrapper .bn-formatting-toolbar,
        .bn-formatting-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05);
          max-width: 340px;
          background: #fff;
        }
        .notion-editor-wrapper .bn-formatting-toolbar .bn-button-group:not(:last-child),
        .bn-formatting-toolbar .bn-button-group:not(:last-child) {
          padding-right: 8px;
          border-right: 1px solid rgba(0, 0, 0, 0.08);
        }
        /* 다열: 좁은 화면에서는 가로 스크롤, 각 열은 유연하게 수축 */
        .notion-page-like .bn-block-column-list {
          gap: 0.5rem;
          width: 100%;
          overflow-x: auto;
        }
        .notion-page-like .bn-block-column {
          min-width: 4.5rem;
          flex: 1 1 0;
        }
      `}</style>

      <p className="mt-4 w-full max-w-none px-0 text-[11px] leading-relaxed text-muted-foreground">
        <kbd className="rounded border bg-muted/50 px-1 py-px font-mono text-[10px]">/</kbd>
        &nbsp;블록 ·{" "}
        <kbd className="rounded border bg-muted/50 px-1 py-px font-mono text-[10px]">@</kbd>
        &nbsp;동료 호출(알림) · <strong>두 열~여섯 열</strong>로 페이지를 가로로 나눌 수 있어요 (노션처럼 블록을
        블록 <strong>왼쪽·오른쪽 가장자리</strong>로 드래그하면 열을 더 만들거나 합칠 수 있습니다)
        · 줄 맨 앞{" "}
        <kbd className="rounded border bg-muted/50 px-1 py-px font-mono text-[10px]">#</kbd>
        , <kbd className="rounded border bg-muted/50 px-1 py-px font-mono text-[10px]">-</kbd>
        , <kbd className="rounded border bg-muted/50 px-1 py-px font-mono text-[10px]">[]</kbd> ·
        왼쪽 <span className="font-mono">⋮⋮</span>로 순서 이동 · 접기는 <strong>토글</strong> /
        <strong>접을 수 있는 제목</strong> · <strong>표</strong>: 칸 여러 개 드래그 선택 → 표 오른쪽 핸들 메뉴에서{" "}
        <strong>셀 병합</strong> / <strong>셀 분할</strong>
      </p>
    </div>
  );
});
