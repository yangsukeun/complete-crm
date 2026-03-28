"use client";

import { useState, useRef, useEffect } from "react";

/**
 * HTML 블록 UI (코드 + 미리보기 + 새 탭).
 * BlockNote 편집기 미리보기와 동일하게 전체 HTML 문서는 원본 srcDoc으로 렌더링합니다.
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
  const [iframeHeight, setIframeHeight] = useState(400);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (mode !== "preview") return;
    const timer = setTimeout(() => {
      const el = iframeRef.current;
      if (el?.contentWindow?.document) {
        const d = el.contentWindow.document;
        const h = Math.max(d.documentElement?.scrollHeight ?? 0, d.body?.scrollHeight ?? 0, 200);
        setIframeHeight(h + 20);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mode, content]);

  const openNewTab = () => {
    if (!content) return;
    const blob = new Blob([content], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  return (
    <div
      className="html-block-root"
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        overflow: "hidden",
        margin: "8px 0",
        minHeight: mode === "preview" ? "200px" : "160px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "6px 10px",
          background: "#1e1e1e",
          borderBottom: "1px solid #333",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "12px",
            color: "#888",
            fontWeight: 500,
            marginRight: "8px",
            fontFamily: "monospace",
          }}
        >
          &lt;/&gt; HTML
        </span>

        <button
          type="button"
          onClick={() => setMode("code")}
          style={{
            padding: "3px 12px",
            borderRadius: "4px",
            fontSize: "12px",
            background: mode === "code" ? "#6366f1" : "transparent",
            color: mode === "code" ? "white" : "#888",
            border: mode === "code" ? "none" : "1px solid #444",
            cursor: "pointer",
          }}
        >
          코드
        </button>

        <button
          type="button"
          onClick={() => setMode("preview")}
          style={{
            padding: "3px 12px",
            borderRadius: "4px",
            fontSize: "12px",
            background: mode === "preview" ? "#6366f1" : "transparent",
            color: mode === "preview" ? "white" : "#888",
            border: mode === "preview" ? "none" : "1px solid #444",
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
              padding: "3px 12px",
              borderRadius: "4px",
              fontSize: "12px",
              background: "transparent",
              color: "#888",
              border: "1px solid #444",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
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
          placeholder={`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: sans-serif; padding: 20px; }
  </style>
</head>
<body>
  <h1>여기에 HTML 코드 붙여넣기</h1>
</body>
</html>`}
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
        <div
          className="html-block-preview"
          style={{
            background: "white",
            minHeight: "200px",
            maxHeight: "500px",
            overflowY: "auto",
          }}
        >
          <iframe
            ref={iframeRef}
            title="HTML 미리보기"
            srcDoc={content}
            sandbox="allow-scripts allow-same-origin"
            style={{
              width: "100%",
              height: `${iframeHeight}px`,
              border: "none",
              display: "block",
            }}
            onLoad={() => {
              const el = iframeRef.current;
              if (el?.contentWindow?.document) {
                const d = el.contentWindow.document;
                const h = Math.max(
                  d.documentElement?.scrollHeight ?? 0,
                  d.body?.scrollHeight ?? 0,
                  200
                );
                setIframeHeight(h + 20);
              }
            }}
          />
        </div>
      ) : null}

      {mode === "preview" && !content ? (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "#9ca3af",
            fontSize: "13px",
            background: "#f9fafb",
          }}
        >
          코드 탭에서 HTML을 입력하면 여기에 미리보기가 표시됩니다
        </div>
      ) : null}
    </div>
  );
}
