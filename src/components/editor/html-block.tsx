"use client";

import { useState } from "react";
import { sanitizeNoteHtml } from "@/lib/sanitize-note-html";

/**
 * HTML 블록 UI (코드 + 미리보기).
 * BlockNote 커스텀 블록은 DOM 기반(`blocknote-html-embed.ts`)으로 렌더링하며,
 * 이 컴포넌트는 동일 UX를 React로 재사용할 때 쓸 수 있습니다.
 */
export function HTMLBlock({
  content,
  onChange,
}: {
  content: string;
  onChange: (val: string) => void;
}) {
  const [mode, setMode] = useState<"code" | "preview">("code");

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        overflow: "hidden",
        margin: "8px 0",
      }}
      className="dark:border-border"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "6px 8px",
          background: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
        }}
        className="dark:bg-muted/50 dark:border-border"
      >
        <span style={{ fontSize: "12px", color: "#6b7280", marginRight: "8px" }}>🖥️ HTML</span>
        {(["code", "preview"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            style={{
              padding: "2px 10px",
              borderRadius: "4px",
              fontSize: "12px",
              background: mode === m ? "#6366f1" : "transparent",
              color: mode === m ? "white" : "#6b7280",
              border: "none",
              cursor: "pointer",
            }}
          >
            {m === "code" ? "코드" : "미리보기"}
          </button>
        ))}
      </div>

      {mode === "code" && (
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder="HTML 코드를 입력하세요..."
          style={{
            width: "100%",
            minHeight: "200px",
            padding: "12px",
            fontFamily: "monospace",
            fontSize: "13px",
            border: "none",
            resize: "vertical",
            outline: "none",
            lineHeight: 1.6,
            background: "#1e1e1e",
            color: "#d4d4d4",
          }}
        />
      )}

      {mode === "preview" &&
        (content ? (
          <iframe
            title="HTML 미리보기"
            srcDoc={sanitizeNoteHtml(content)}
            sandbox=""
            style={{
              width: "100%",
              minHeight: "200px",
              border: "none",
              display: "block",
              background: "white",
            }}
            onLoad={(e) => {
              const el = e.target as HTMLIFrameElement;
              try {
                if (el.contentWindow?.document.body) {
                  el.style.height = `${el.contentWindow.document.body.scrollHeight + 40}px`;
                }
              } catch {
                /* ignore */
              }
            }}
          />
        ) : (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "#9ca3af",
              fontSize: "13px",
            }}
          >
            코드 탭에서 HTML을 입력하면 여기에 미리보기가 표시됩니다
          </div>
        ))}
    </div>
  );
}
