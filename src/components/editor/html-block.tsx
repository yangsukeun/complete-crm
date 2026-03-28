"use client";

import { useState, useRef } from "react";
import { sanitizeNoteHtml } from "@/lib/sanitize-note-html";

/**
 * HTML 블록 UI (코드 + 미리보기 + 새 탭).
 * BlockNote 편집기는 `blocknote-html-embed.ts`(DOM 스펙)와 동일 UX를 맞춥니다.
 */
export function HTMLBlock({
  content,
  onChange,
  readOnly = false,
}: {
  content: string;
  onChange?: (val: string) => void;
  readOnly?: boolean;
}) {
  const [mode, setMode] = useState<"code" | "preview">(readOnly ? "preview" : "code");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const autoResize = () => {
    const el = iframeRef.current;
    if (el?.contentWindow?.document?.body) {
      const h = el.contentWindow.document.body.scrollHeight;
      el.style.height = `${Math.max(h + 40, 100)}px`;
    }
  };

  const openNewTab = () => {
    if (!content) return;
    const blob = new Blob([content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const safePreview = sanitizeNoteHtml(content);

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        overflow: "hidden",
        margin: "12px 0",
      }}
      className="dark:border-border"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "6px 10px",
          background: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
        }}
        className="dark:bg-muted/50 dark:border-border"
      >
        <span
          style={{
            fontSize: "12px",
            color: "#6b7280",
            fontWeight: 500,
            marginRight: "8px",
          }}
        >
          🖥️ HTML
        </span>

        <button
          type="button"
          onClick={() => setMode("code")}
          style={{
            padding: "2px 10px",
            borderRadius: "4px",
            fontSize: "12px",
            background: mode === "code" ? "#6366f1" : "transparent",
            color: mode === "code" ? "white" : "#6b7280",
            border: "none",
            cursor: "pointer",
          }}
        >
          코드
        </button>

        <button
          type="button"
          onClick={() => setMode("preview")}
          style={{
            padding: "2px 10px",
            borderRadius: "4px",
            fontSize: "12px",
            background: mode === "preview" ? "#6366f1" : "transparent",
            color: mode === "preview" ? "white" : "#6b7280",
            border: "none",
            cursor: "pointer",
          }}
        >
          미리보기
        </button>

        {content ? (
          <button
            type="button"
            onClick={openNewTab}
            style={{
              marginLeft: "auto",
              padding: "2px 10px",
              borderRadius: "4px",
              fontSize: "12px",
              background: "transparent",
              color: "#6b7280",
              border: "1px solid #e5e7eb",
              cursor: "pointer",
            }}
          >
            ↗ 새 탭
          </button>
        ) : null}
      </div>

      {mode === "code" && (
        <textarea
          value={content}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={readOnly}
          placeholder="HTML 코드를 입력하세요..."
          style={{
            width: "100%",
            minHeight: "200px",
            padding: "12px 16px",
            fontFamily: "monospace",
            fontSize: "13px",
            border: "none",
            resize: "vertical",
            outline: "none",
            lineHeight: 1.6,
            background: "#1e1e1e",
            color: "#d4d4d4",
            display: "block",
            boxSizing: "border-box",
          }}
        />
      )}

      {mode === "preview" && content ? (
        <iframe
          ref={iframeRef}
          title="HTML 미리보기"
          srcDoc={safePreview}
          sandbox="allow-scripts"
          style={{
            width: "100%",
            minHeight: "100px",
            border: "none",
            display: "block",
            background: "white",
          }}
          onLoad={autoResize}
        />
      ) : null}

      {mode === "preview" && !content ? (
        <div
          style={{
            padding: "32px",
            textAlign: "center",
            color: "#9ca3af",
            fontSize: "13px",
          }}
        >
          코드 탭에서 HTML을 입력하면 여기에 미리보기가 표시됩니다
        </div>
      ) : null}
    </div>
  );
}
