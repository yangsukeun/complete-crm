"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HtmlEditorModeTabs, type HtmlEditorMode } from "@/components/html-editor-mode-tabs";
import { TaskBodyEditorDynamic } from "@/components/task-body-editor-dynamic";
import {
  isTaskHtmlPage,
  stripTaskHtmlPage,
  wrapTaskHtmlPage,
} from "@/lib/task-body-description";
import { workspaceFetchHeaders } from "@/lib/workspace-fetch-headers";
import { cn } from "@/lib/utils";

const HTML_SAVE_DEBOUNCE_MS = 1200;

type Props = {
  taskId: string;
  initialDescription: string | null;
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
  onSaved,
  className,
}: Props) {
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

  useEffect(() => {
    const isHtml = isTaskHtmlPage(initialDescription);
    setEditorMode(isHtml ? "html" : "text");
    const stripped = isHtml ? stripTaskHtmlPage(initialDescription ?? "") : "";
    setHtmlContent(stripped);
    lastSavedHtmlRef.current = stripped;
  }, [taskId, initialDescription]);

  const saveHtml = useCallback(
    async (html: string) => {
      if (lastSavedHtmlRef.current === html) return;
      setHtmlSaving(true);
      try {
        const stored = html.trim() ? wrapTaskHtmlPage(html.trim()) : null;
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          credentials: "include",
          headers: workspaceFetchHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ description: stored }),
        });
        if (!res.ok) throw new Error("저장 실패");
        lastSavedHtmlRef.current = html;
        onSaved();
      } catch {
        toast.error("HTML 본문 저장에 실패했습니다.");
      } finally {
        setHtmlSaving(false);
      }
    },
    [taskId, onSaved]
  );

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
    return () => {
      if (htmlDebounceRef.current) clearTimeout(htmlDebounceRef.current);
    };
  }, []);

  const handleHtmlChange = (v: string) => {
    setHtmlContent(v);
    scheduleHtmlSave(v);
  };

  const handleModeChange = (m: HtmlEditorMode) => {
    if (m === editorMode) return;
    if ((editorMode === "html" || editorMode === "preview") && m === "text") {
      if (htmlDebounceRef.current) {
        clearTimeout(htmlDebounceRef.current);
        htmlDebounceRef.current = null;
      }
      void saveHtml(htmlContent);
    }
    setEditorMode(m);
  };

  const blockNoteInitial = isTaskHtmlPage(initialDescription) ? null : initialDescription;

  return (
    <div className={cn("space-y-2", className)}>
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
              key={`${taskId}-${initialIsHtml ? "fresh" : "doc"}`}
              taskId={taskId}
              initialDescription={blockNoteInitial}
              onSaved={onSaved}
            />
          ) : (
            <p className="text-muted-foreground py-6 text-sm">
              텍스트 탭을 선택하면 BlockNote 에디터가 열립니다.{" "}
              <kbd className="rounded border px-1 text-[10px]">/</kbd> 메뉴에서 HTML 블록·YouTube 등을 넣을 수 있습니다.
            </p>
          )
        }
      />
      {htmlSaving && editorMode !== "text" ? (
        <p className="text-muted-foreground text-xs">HTML 저장 중…</p>
      ) : null}
      {editorMode === "text" && initialIsHtml ? (
        <p className="text-muted-foreground text-xs">
          이 업무는 HTML 전체 페이지로 저장되어 있습니다. 텍스트 탭에서 새로 작성하면 BlockNote 본문으로 덮어씁니다.
        </p>
      ) : null}
    </div>
  );
}
