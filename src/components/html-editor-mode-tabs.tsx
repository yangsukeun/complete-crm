"use client";

import type { ReactNode } from "react";

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
 * 미리보기는 원본 HTML을 iframe에 넣습니다(XSS 주의 — 신뢰할 수 있는 입력만).
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
        <textarea
          value={htmlContent}
          onChange={(e) => setHtmlContent(e.target.value)}
          onBlur={() => onHtmlBlur?.()}
          placeholder="HTML 코드를 붙여넣으세요..."
          style={{
            width: "100%",
            minHeight: "300px",
            padding: "12px",
            fontFamily: "monospace",
            fontSize: "13px",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            resize: "vertical",
          }}
          className="bg-background text-foreground dark:border-border"
        />
      )}

      {editorMode === "preview" && htmlContent.trim() && (
        <iframe
          title="미리보기"
          srcDoc={htmlContent}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          style={{
            width: "100%",
            minHeight: "400px",
            border: "none",
            display: "block",
          }}
          className="bg-white dark:bg-card"
          onLoad={(e) => {
            const el = e.target as HTMLIFrameElement;
            try {
              const h = el.contentWindow?.document?.documentElement?.scrollHeight;
              if (h && h > 100) {
                el.style.height = `${h + 24}px`;
              }
            } catch {
              /* ignore */
            }
          }}
        />
      )}

      {editorMode === "preview" && !htmlContent.trim() && (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "#9ca3af",
            border: "1px dashed #e5e7eb",
            borderRadius: "8px",
          }}
          className="dark:border-border dark:text-muted-foreground"
        >
          {emptyPreviewMessage}
        </div>
      )}
    </div>
  );
}
