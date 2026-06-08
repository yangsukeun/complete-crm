"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HtmlEditorModeTabs, type HtmlEditorMode } from "@/components/html-editor-mode-tabs";
import {
  TaskBodyEditorDynamic,
  type TaskBodyEditorHandle,
} from "@/components/task-body-editor-dynamic";
import {
  isTaskHtmlPage,
  stripTaskHtmlPage,
  wrapTaskHtmlPage,
} from "@/lib/task-body-description";
import { workspaceFetchHeaders } from "@/lib/workspace-fetch-headers";
import { createSequencedDescriptionPatcher } from "@/lib/sequenced-patch-client";
import { BodyMetaColumn, BodyMetaLine } from "@/components/body-meta-line";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";

const HTML_SAVE_DEBOUNCE_MS = 1200;

type Props = {
  taskId: string;
  initialDescription: string | null;
  bodyUpdatedAt: string | null;
  authorId?: string | null;
  authorName?: string | null;
  editorName?: string | null;
  createdAtIso?: string | null;
  onSaved: () => void;
  className?: string;
};

/**
 * 업무 본문: 게시판과 동일한 텍스트(BlockNote) / HTML / 미리보기 탭.
 * HTML 전체 페이지는 description에 `__HTML_PAGE_V1__` 접두로 저장.
 */
export function TaskBodyEditorWithTabs({
  taskId,
  initialDescription,
  bodyUpdatedAt,
  authorId,
  authorName,
  editorName,
  createdAtIso,
  onSaved,
  className,
}: Props) {
  const { data: session } = useSession();
  const [displayUpdatedAt, setDisplayUpdatedAt] = useState<string | null>(bodyUpdatedAt);
  const [displayEditorName, setDisplayEditorName] = useState<string | null>(editorName ?? null);
  const initialIsHtml = isTaskHtmlPage(initialDescription);
  const [editorMode, setEditorMode] = useState<HtmlEditorMode>(initialIsHtml ? "html" : "text");
  const [htmlContent, setHtmlContent] = useState(
    initialIsHtml ? stripTaskHtmlPage(initialDescription ?? "") : ""
  );
  const [htmlSaving, setHtmlSaving] = useState(false);
  const lastSavedHtmlRef = useRef(
    initialIsHtml ? stripTaskHtmlPage(initialDescription ?? "") : ""
  );
  const htmlDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorModeRef = useRef(editorMode);
  editorModeRef.current = editorMode;
  const blockNoteRef = useRef<TaskBodyEditorHandle | null>(null);
  const htmlContentRef = useRef(htmlContent);
  htmlContentRef.current = htmlContent;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const bodyVersionRef = useRef<string | null>(bodyUpdatedAt);

  useEffect(() => {
    bodyVersionRef.current = bodyUpdatedAt;
    setDisplayUpdatedAt(bodyUpdatedAt);
    setDisplayEditorName(editorName ?? null);
  }, [taskId, bodyUpdatedAt, editorName]);

  const notifyBodySaved = useCallback(() => {
    if (bodyVersionRef.current) setDisplayUpdatedAt(bodyVersionRef.current);
    const me = session?.user?.name?.trim();
    if (me) setDisplayEditorName(me);
    onSavedRef.current();
  }, [session?.user?.name]);
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
    const isHtml = isTaskHtmlPage(initialDescription);
    setEditorMode(isHtml ? "html" : "text");
    const stripped = isHtml ? stripTaskHtmlPage(initialDescription ?? "") : "";
    setHtmlContent(stripped);
    lastSavedHtmlRef.current = stripped;
  }, [taskId, initialDescription]);

  const saveHtml = useCallback(
    async (html: string, options?: { keepalive?: boolean; silent?: boolean }) => {
      if (lastSavedHtmlRef.current === html) return;
      setHtmlSaving(true);
      try {
        const stored = html.trim() ? wrapTaskHtmlPage(html.trim()) : null;
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
            toast.error("HTML 본문 저장에 실패했습니다.");
          }
          return;
        }
        if (result.updatedAt) {
          bodyVersionRef.current = result.updatedAt;
        }
        lastSavedHtmlRef.current = html;
        notifyBodySaved();
      } finally {
        setHtmlSaving(false);
      }
    },
    [notifyBodySaved]
  );

  const saveHtmlRef = useRef(saveHtml);
  saveHtmlRef.current = saveHtml;

  const flushHtmlPending = useCallback(async () => {
    if (htmlDebounceRef.current) {
      clearTimeout(htmlDebounceRef.current);
      htmlDebounceRef.current = null;
    }
    if (editorModeRef.current === "html" || editorModeRef.current === "preview") {
      await saveHtmlRef.current(htmlContentRef.current);
    }
  }, []);

  const flushHtmlPendingRef = useRef(flushHtmlPending);
  flushHtmlPendingRef.current = flushHtmlPending;

  const scheduleHtmlSave = useCallback(
    (html: string) => {
      if (htmlDebounceRef.current) clearTimeout(htmlDebounceRef.current);
      htmlDebounceRef.current = setTimeout(() => {
        htmlDebounceRef.current = null;
        if (editorModeRef.current === "html" || editorModeRef.current === "preview") {
          void saveHtml(html);
        }
      }, HTML_SAVE_DEBOUNCE_MS);
    },
    [saveHtml]
  );

  useEffect(() => {
    const onBeforeUnload = () => {
      if (htmlDebounceRef.current) {
        clearTimeout(htmlDebounceRef.current);
        htmlDebounceRef.current = null;
      }
      if (editorModeRef.current === "html" || editorModeRef.current === "preview") {
        void saveHtmlRef.current(htmlContentRef.current, { keepalive: true, silent: true });
      }
      void blockNoteRef.current?.flushPendingSave();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (htmlDebounceRef.current) {
        clearTimeout(htmlDebounceRef.current);
        htmlDebounceRef.current = null;
      }
      void flushHtmlPendingRef.current();
      void blockNoteRef.current?.flushPendingSave();
    };
  }, [taskId]);

  const handleHtmlChange = (v: string) => {
    setHtmlContent(v);
    scheduleHtmlSave(v);
  };

  const handleModeChange = (m: HtmlEditorMode) => {
    if (m === editorMode) return;
    void (async () => {
      if (editorMode === "text" && m !== "text") {
        await blockNoteRef.current?.flushPendingSave();
      }
      if ((editorMode === "html" || editorMode === "preview") && m === "text") {
        if (htmlDebounceRef.current) {
          clearTimeout(htmlDebounceRef.current);
          htmlDebounceRef.current = null;
        }
        await saveHtml(htmlContent);
      }
      setEditorMode(m);
    })();
  };

  const blockNoteInitial = isTaskHtmlPage(initialDescription) ? null : initialDescription;

  const metaProps = {
    authorId,
    authorName,
    editorName: displayEditorName,
    createdAtIso,
    updatedAtIso: displayUpdatedAt,
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="mb-1 flex min-h-[22px] items-center justify-end gap-2 sm:hidden">
        <BodyMetaLine {...metaProps} />
      </div>
      <div className="flex items-start gap-0">
        <div className="min-w-0 flex-1">
        {editorMode !== "text" && htmlSaving ? (
          <div className="mb-1 flex justify-end">
            <span className="text-[11px] tabular-nums text-amber-600/90 animate-pulse">
              HTML 저장 중…
            </span>
          </div>
        ) : null}
        <HtmlEditorModeTabs
          editorMode={editorMode}
          setEditorMode={handleModeChange}
          htmlContent={htmlContent}
          setHtmlContent={handleHtmlChange}
          onHtmlBlur={() => void saveHtml(htmlContent)}
          htmlPageMode
          emptyPreviewMessage="HTML 탭에서 코드를 입력하면 여기에 표시됩니다"
          textEditor={
            editorMode === "text" ? (
              <TaskBodyEditorDynamic
                ref={blockNoteRef}
                key={`${taskId}-${initialIsHtml ? "fresh" : "doc"}`}
                taskId={taskId}
                initialDescription={blockNoteInitial}
                bodyVersionRef={bodyVersionRef}
                onSaved={notifyBodySaved}
                bodyMeta={metaProps}
                currentUserName={session?.user?.name}
                currentUserId={session?.user?.id}
              />
            ) : (
              <p className="text-muted-foreground py-6 text-sm">
                텍스트 탭을 선택하면 BlockNote 에디터가 열립니다.{" "}
                <kbd className="rounded border px-1 text-[10px]">/</kbd> 메뉴에서 HTML 블록·YouTube 등을
                넣을 수 있습니다.
              </p>
            )
          }
        />
        </div>
        {editorMode !== "text" ? (
          <BodyMetaColumn
            {...metaProps}
            className="sticky top-20 mt-10 hidden self-stretch sm:block"
          />
        ) : null}
      </div>
      {editorMode === "text" && initialIsHtml ? (
        <p className="text-muted-foreground text-xs">
          이 업무는 HTML 전체 페이지로 저장되어 있습니다. 텍스트 탭에서 새로 작성하면 BlockNote 본문으로 덮어씁니다.
        </p>
      ) : null}
    </div>
  );
}
