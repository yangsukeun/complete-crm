"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { injectIframePreviewBaseStyle } from "@/lib/html-iframe-preview";
import { ScaledHtmlIframe } from "@/components/scaled-html-iframe";

export type HtmlEditorMode = "text" | "html" | "preview";

type Props = {
  editorMode: HtmlEditorMode;
  setEditorMode: (m: HtmlEditorMode) => void;
  htmlContent: string;
  setHtmlContent: (v: string) => void;
  /** 텍스트 탭: 게시판은 ContentBodyEditor, 메모는 textarea 등 */
  textEditor: ReactNode;
  emptyPreviewMessage?: string;
  /** HTML 탭 textarea blur 시 저장 등 */
  onHtmlBlur?: () => void;
};

/**
 * 게시판·메모 본문용: 텍스트 / HTML / 미리보기 탭
 * 미리보기 iframe은 원본 htmlContent 사용(XSS 주의).
 */
export function HtmlEditorModeTabs({
  editorMode,
  setEditorMode,
  htmlContent,
  setHtmlContent,
  textEditor,
  emptyPreviewMessage = "HTML 탭에서 코드를 입력하세요",
  onHtmlBlur,
}: Props) {
  const fallbackInner = useMemo(
    () =>
      `<p style="color:#999;padding:20px;margin:0">${emptyPreviewMessage
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</p>`,
    [emptyPreviewMessage]
  );

  const [previewSrcDoc, setPreviewSrcDoc] = useState(() =>
    htmlContent.trim()
      ? injectIframePreviewBaseStyle(htmlContent)
      : injectIframePreviewBaseStyle(fallbackInner)
  );

  useEffect(() => {
    const o = window.location.origin;
    setPreviewSrcDoc(
      htmlContent.trim()
        ? injectIframePreviewBaseStyle(htmlContent, { documentOrigin: o })
        : injectIframePreviewBaseStyle(fallbackInner, { documentOrigin: o })
    );
  }, [htmlContent, fallbackInner]);

  return (
    <div className="space-y-2">
      <div
        className="flex gap-1 border-b border-gray-200 pb-2 dark:border-border"
        style={{ display: "flex", gap: "4px", marginBottom: "8px", paddingBottom: "8px" }}
      >
        {(["text", "html", "preview"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setEditorMode(mode)}
            style={{
              padding: "4px 12px",
              borderRadius: "6px",
              fontSize: "13px",
              background: editorMode === mode ? "#6366f1" : "transparent",
              color: editorMode === mode ? "white" : "#6b7280",
              border: "none",
              cursor: "pointer",
            }}
          >
            {mode === "text" ? "텍스트" : mode === "html" ? "HTML" : "미리보기"}
          </button>
        ))}
      </div>

      {editorMode === "text" && textEditor}

      {editorMode === "html" && (
        <>
          <div
            style={{
              fontSize: "12px",
              color: "#9ca3af",
              padding: "8px 12px",
              background: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
              borderRadius: "8px 8px 0 0",
              marginBottom: "-1px",
            }}
            className="dark:border-border dark:bg-muted/40 dark:text-muted-foreground"
          >
            💡 글 전체를 HTML로 작성할 때 사용합니다. 텍스트와 HTML을 섞으려면 텍스트 탭에서{" "}
            <kbd className="rounded border px-1 text-[10px]">/</kbd> 키로 HTML 블록을 추가하세요.
          </div>
        <div
          className="relative isolate rounded-b-lg border border-t-0 border-[#e5e7eb] dark:border-border"
          onPointerDownCapture={(e) => e.stopPropagation()}
          onKeyDownCapture={(e) => e.stopPropagation()}
          onPasteCapture={(e) => e.stopPropagation()}
        >
          <textarea
            value={htmlContent}
            onChange={(e) => {
              e.stopPropagation();
              setHtmlContent(e.target.value);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
            }}
            onPaste={(e) => {
              e.stopPropagation();
              const text = e.clipboardData.getData("text/plain");
              const ta = e.currentTarget;
              const start = ta.selectionStart ?? 0;
              const end = ta.selectionEnd ?? 0;
              const next =
                htmlContent.slice(0, start) + text + htmlContent.slice(end);
              setHtmlContent(next);
              e.preventDefault();
              requestAnimationFrame(() => {
                const pos = start + text.length;
                ta.setSelectionRange(pos, pos);
              });
            }}
            onBlur={() => onHtmlBlur?.()}
            placeholder="HTML 코드를 붙여넣으세요..."
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: "300px",
              padding: "12px",
              fontFamily: "monospace",
              fontSize: "13px",
              background: "#1e1e1e",
              color: "#d4d4d4",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              resize: "vertical",
              outline: "none",
            }}
            className="dark:border-border rounded-b-lg border-0"
          />
        </div>
        </>
      )}

      {editorMode === "preview" && (
        <ScaledHtmlIframe
          key={htmlContent || "empty"}
          title="미리보기"
          srcDoc={previewSrcDoc}
          className="bg-white"
          minLogicalHeight={400}
          maxLogicalHeight={4000}
        />
      )}
    </div>
  );
}
