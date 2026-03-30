"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { injectIframePreviewBaseStyle } from "@/lib/html-iframe-preview";
import { ScaledHtmlIframe } from "@/components/scaled-html-iframe";

export interface HTMLBlockProps {
  content: string;
  onChange?: (val: string) => void;
  readOnly?: boolean;
}

/**
 * 노션 스타일 HTML 블록: 편집 중 blur 또는「미리보기 →」로 미리보기 전환, 미리보기에서 편집 버튼으로 복귀.
 */
export function HTMLBlock({ content, onChange, readOnly = false }: HTMLBlockProps) {
  const [isEditing, setIsEditing] = useState(!content.trim());
  const [localContent, setLocalContent] = useState(content);
  const [iframeSrcDoc, setIframeSrcDoc] = useState(() =>
    injectIframePreviewBaseStyle(localContent)
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setIframeSrcDoc(
      injectIframePreviewBaseStyle(localContent, {
        documentOrigin: window.location.origin,
      })
    );
  }, [localContent]);

  useEffect(() => {
    setLocalContent(content);
    if (!content.trim()) setIsEditing(true);
  }, [content]);

  const handleBlur = useCallback(() => {
    if (localContent.trim()) {
      setIsEditing(false);
      onChange?.(localContent);
    }
  }, [localContent, onChange]);

  const handlePreviewClick = () => {
    if (!readOnly) {
      setIsEditing(true);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const openNewTab = () => {
    if (!localContent.trim()) return;
    const blob = new Blob(
      [
        injectIframePreviewBaseStyle(localContent, {
          documentOrigin: window.location.origin,
        }),
      ],
      {
        type: "text/html;charset=utf-8",
      }
    );
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  if (isEditing) {
    return (
      <div
        style={{
          border: "2px solid #6366f1",
          borderRadius: "8px",
          overflow: "hidden",
          margin: "8px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 12px",
            background: "#1e1e1e",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              color: "#888",
              fontFamily: "monospace",
              letterSpacing: "1px",
            }}
          >
            HTML · 편집 중 (포커스를 잃으면 미리보기로 전환)
          </span>
          {localContent.trim() ? (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsEditing(false);
                onChange?.(localContent);
              }}
              style={{
                padding: "2px 10px",
                borderRadius: "4px",
                fontSize: "11px",
                background: "#6366f1",
                color: "white",
                border: "none",
                cursor: "pointer",
              }}
            >
              미리보기 →
            </button>
          ) : null}
        </div>
        <textarea
          ref={textareaRef}
          value={localContent}
          autoFocus={!readOnly}
          readOnly={readOnly}
          onChange={(e) => setLocalContent(e.target.value)}
          onBlur={() => {
            if (!readOnly) void handleBlur();
          }}
          placeholder={`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: sans-serif; padding: 20px; }
  </style>
</head>
<body>
  <h1>HTML 코드를 여기에 붙여넣으세요</h1>
</body>
</html>`}
          style={{
            width: "100%",
            minHeight: "240px",
            padding: "16px",
            fontFamily: "monospace",
            fontSize: "13px",
            background: "#1e1e1e",
            color: "#d4d4d4",
            border: "none",
            outline: "none",
            resize: "vertical",
            lineHeight: 1.6,
            display: "block",
            boxSizing: "border-box",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        overflow: "hidden",
        margin: "8px 0",
        cursor: readOnly ? "default" : "pointer",
      }}
      className="dark:border-border"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 10px",
          background: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
        }}
        className="dark:bg-muted/40 dark:border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", color: "#6b7280", fontFamily: "monospace" }}>
            🖥️ HTML 미리보기
          </span>
          {!readOnly ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                handlePreviewClick();
              }}
              style={{
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                background: "transparent",
                color: "#9ca3af",
                border: "1px solid #e5e7eb",
                cursor: "pointer",
              }}
            >
              ✏️ 편집
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            openNewTab();
          }}
          style={{
            padding: "2px 10px",
            borderRadius: "4px",
            fontSize: "11px",
            background: "transparent",
            color: "#6b7280",
            border: "1px solid #e5e7eb",
            cursor: "pointer",
          }}
        >
          ↗ 새 탭
        </button>
      </div>

      {localContent.trim() ? (
        <div className="html-block-preview" style={{ background: "white" }}>
          <ScaledHtmlIframe
            key={iframeSrcDoc.slice(0, 64)}
            title="HTML 미리보기"
            srcDoc={iframeSrcDoc}
            minLogicalHeight={200}
            maxLogicalHeight={5000}
          />
        </div>
      ) : (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "#9ca3af",
            fontSize: "13px",
            background: "#f9fafb",
          }}
        >
          내용이 없습니다. 클릭하여 편집합니다.
        </div>
      )}
    </div>
  );
}
