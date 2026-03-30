"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
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
import { getYoutubeVideoId } from "@/lib/blocknote-youtube";
import { taskBodySchema } from "@/lib/task-body-schema";
import { parseStoredTaskBody, serializeTaskBodyForStore } from "@/lib/task-body-description";
import { normalizeImageBlocksDriveDisplayUrls } from "@/lib/task-body-drive-images";
import {
  createPastedImageBlock,
  getClipboardImageFile,
  getFirstImageFileFromDataTransfer,
  isParagraphEffectivelyEmpty,
  uploadImageViaApi,
} from "@/lib/editor-image-upload";
import { UPLOAD_TOAST_DURATION_MS } from "@/lib/upload-client-validate";

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

function isUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test((s ?? "").trim());
}

function isYoutubeUrl(s: string): boolean {
  return /youtube\.com|youtu\.be/i.test(s ?? "") || getYoutubeVideoId(s ?? "") !== null;
}

/** 붙여넣기 끝의 ),. 등 제거 */
function stripTrailingJunkFromUrl(url: string): string {
  return url.replace(/[),.;>\]'"]+$/g, "");
}

/** 클립보드 텍스트에서 단일 URL 추출 (줄바꿈 앞 첫 줄, 문장 속 URL도 시도) */
function extractUrlFromPlainPaste(raw: string): string | null {
  const first = raw.trim().split(/\n/)[0]?.trim() ?? "";
  if (!first) return null;
  const cleaned = stripTrailingJunkFromUrl(first);
  if (isUrl(cleaned)) return cleaned;
  const m = first.match(/https?:\/\/[^\s<>"']+/i);
  if (m) {
    const u = stripTrailingJunkFromUrl(m[0]);
    if (isUrl(u)) return u;
  }
  return null;
}

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
          insertOrUpdateBlockForSlashMenu(editor, makeColumnListBlock(n) as any);
        },
      }));
      return filterSuggestionItems(
        combineByGroup(
          getDefaultReactSlashMenuItems(editor),
          getMultiColumnSlashMenuItems(editor),
          wideCols
        ),
        query
      );
    },
    [editor]
  );
  return <SuggestionMenuController triggerCharacter="/" getItems={getItems} />;
}

type TaskBodyEditorProps = {
  taskId: string;
  initialDescription: string | null;
  onSaved: () => void;
  className?: string;
};

export function TaskBodyEditor({
  taskId,
  initialDescription,
  onSaved,
  className,
}: TaskBodyEditorProps) {
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
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const loadedForTaskIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    if (!editor || !taskId) return;

    const raw = (initialDescription ?? "").trim();
    if (!raw) {
      loadedForTaskIdRef.current = taskId;
      return;
    }

    // 이미 이 업무 본문을 에디터에 반영했다면 다시 넣지 않음 (Strict Mode·부모 리렌더와 무관하게 사용자 편집 유지)
    if (loadedForTaskIdRef.current === taskId) return;

    // replaceBlocks는 React 렌더/useEffect 동기 구간에서 호출 시 flushSync 경고가 난다.
    // ref는 apply 성공 후에만 설정해, Strict Mode에서 cleanup이 타이머만 취소하고 "이미 로드됨"으로 잘못 막는 문제를 방지한다.
    const apply = () => {
      try {
        const parsed = parseStoredTaskBody(raw);
        if (parsed?.format === "blocks" && parsed.blocks.length > 0) {
          const normalized = normalizeImageBlocksDriveDisplayUrls(
            parsed.blocks as unknown[]
          ) as typeof parsed.blocks;
          editor.replaceBlocks(editor.document, normalized as any);
          loadedForTaskIdRef.current = taskId;
          return;
        }
        if (parsed?.format === "blocks") {
          loadedForTaskIdRef.current = taskId;
          return;
        }
        if (parsed?.format === "markdown") {
          const blocks = editor.tryParseMarkdownToBlocks(parsed.markdown);
          if (blocks.length > 0) {
            editor.replaceBlocks(editor.document, blocks);
          }
          loadedForTaskIdRef.current = taskId;
        }
      } catch {
        // ignore parse/replace errors
      }
    };
    const id = window.setTimeout(apply, 0);
    return () => window.clearTimeout(id);
  }, [editor, taskId, initialDescription]);

  const performSave = useCallback(async () => {
    if (!editor) return;
    setSaveStatus("saving");
    try {
      const stored = serializeTaskBodyForStore(editor);
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: stored }),
      });
      if (!res.ok) throw new Error("저장 실패");
      setSaveStatus("saved");
      onSavedRef.current();
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      toast.error("본문 자동 저장에 실패했습니다.");
      setSaveStatus("idle");
    }
  }, [taskId, editor]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      performSave();
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
          const cur = editor.getTextCursorPosition();
          const refBlock = cur?.block ?? editor.document[editor.document.length - 1];
          void toast.promise(
            (async () => {
              const url = await uploadImageViaApi(imageFile);
              if (!refBlock) throw new Error("삽입 위치를 찾을 수 없습니다.");
              const block = createPastedImageBlock(url, imageFile.name || "pasted-image.png");
              if (isParagraphEffectivelyEmpty(refBlock)) {
                editor.replaceBlocks([refBlock], [block as never]);
              } else {
                editor.insertBlocks([block as never], refBlock, "after");
              }
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

        const block = isYoutubeUrl(urlText)
          ? { type: "youtube" as const, props: { url: urlText } }
          : { type: "linkPreview" as const, props: { url: urlText } };

        const cur = editor.getTextCursorPosition();
        const refBlock = cur?.block ?? editor.document[editor.document.length - 1];
        if (!refBlock) return;

        if (isParagraphEffectivelyEmpty(refBlock)) {
          editor.replaceBlocks([refBlock], [block as any]);
        } else {
          editor.insertBlocks([block as any], refBlock, "after");
        }
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
        const cur = editor.getTextCursorPosition();
        const refBlock = cur?.block ?? editor.document[editor.document.length - 1];
        void toast.promise(
          (async () => {
            const url = await uploadImageViaApi(file);
            if (!refBlock) throw new Error("삽입 위치를 찾을 수 없습니다.");
            const block = createPastedImageBlock(url, file.name || "image.png");
            if (isParagraphEffectivelyEmpty(refBlock)) {
              editor.replaceBlocks([refBlock], [block as never]);
            } else {
              editor.insertBlocks([block as never], refBlock, "after");
            }
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
        <strong>접을 수 있는 제목</strong>
      </p>
    </div>
  );
}
