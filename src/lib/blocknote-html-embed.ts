import { createBlockConfig, createBlockSpec, defaultProps } from "@blocknote/core";
import { sanitizeNoteHtml } from "@/lib/sanitize-note-html";

const createHtmlBlockConfig = createBlockConfig(() => ({
  type: "htmlBlock" as const,
  propSchema: {
    textAlignment: defaultProps.textAlignment,
    backgroundColor: defaultProps.backgroundColor,
    html: { default: "" as const },
    /** "code" = 편집, "preview" = 미리보기 (노션 스타일 전환) */
    viewMode: { default: "code" as const },
  },
  content: "none" as const,
}));

export const createHtmlBlockSpec = createBlockSpec(
  createHtmlBlockConfig,
  () => ({
    render(block, editor) {
      let viewMode = (block.props as { viewMode?: string }).viewMode === "preview" ? "preview" : "code";
      const htmlTrim = ((block.props as { html?: string }).html ?? "").trim();
      if (viewMode === "preview" && !htmlTrim) viewMode = "code";

      const wrapper = document.createElement("div");
      wrapper.className = "bn-html-block-wrapper";
      wrapper.setAttribute("data-html-block", "1");
      wrapper.style.cssText =
        "margin:8px 0;background:#fff;border-radius:8px;overflow:visible";
      wrapper.setAttribute("contenteditable", "false");

      if (viewMode === "code") {
        wrapper.style.border = "2px solid #6366f1";
        const head = document.createElement("div");
        head.style.cssText =
          "display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:#1e1e1e";
        const hint = document.createElement("span");
        hint.textContent = "HTML · 편집 중 (포커스를 잃으면 미리보기로 전환)";
        hint.style.cssText =
          "font-size:11px;color:#888;font-family:ui-monospace,monospace;letter-spacing:0.5px";
        head.appendChild(hint);

        const initialHtml = (block.props as { html?: string }).html ?? "";
        const ta = document.createElement("textarea");
        ta.value = initialHtml;
        ta.placeholder = "HTML 코드를 입력하세요…";
        ta.style.cssText = [
          "width:100%",
          "min-height:240px",
          "padding:16px",
          "font-family:ui-monospace,monospace",
          "font-size:13px",
          "border:none",
          "resize:vertical",
          "outline:none",
          "line-height:1.6",
          "background:#1e1e1e",
          "color:#d4d4d4",
          "box-sizing:border-box",
        ].join(";");

        const previewBtn = document.createElement("button");
        previewBtn.type = "button";
        previewBtn.textContent = "미리보기 →";
        previewBtn.style.cssText =
          "padding:2px 10px;border-radius:4px;font-size:11px;background:#6366f1;color:white;border:none;cursor:pointer";
        previewBtn.style.display = initialHtml.trim() ? "block" : "none";
        previewBtn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const v = ta.value;
          if (!v.trim()) return;
          editor.updateBlock(block, { props: { html: v, viewMode: "preview" } });
        });
        head.appendChild(previewBtn);

        ta.addEventListener("input", () => {
          editor.updateBlock(block, { props: { html: ta.value, viewMode: "code" } });
          previewBtn.style.display = ta.value.trim() ? "block" : "none";
        });
        ta.addEventListener("blur", () => {
          const v = ta.value;
          if (v.trim()) {
            editor.updateBlock(block, { props: { html: v, viewMode: "preview" } });
          }
        });

        wrapper.appendChild(head);
        wrapper.appendChild(ta);
      } else {
        wrapper.style.border = "1px solid #e5e7eb";
        const head = document.createElement("div");
        head.style.cssText =
          "display:flex;align-items:center;justify-content:space-between;padding:5px 10px;background:#f9fafb;border-bottom:1px solid #e5e7eb";
        const left = document.createElement("div");
        left.style.cssText = "display:flex;align-items:center;gap:8px";
        const badge = document.createElement("span");
        badge.textContent = "🖥️ HTML 미리보기";
        badge.style.cssText = "font-size:11px;color:#6b7280;font-family:ui-monospace,monospace";
        left.appendChild(badge);
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = "✏️ 편집";
        editBtn.style.cssText =
          "padding:2px 8px;border-radius:4px;font-size:11px;background:transparent;color:#9ca3af;border:1px solid #e5e7eb;cursor:pointer";
        editBtn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        editBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          editor.updateBlock(block, { props: { viewMode: "code" } });
        });
        left.appendChild(editBtn);
        head.appendChild(left);

        const newTabBtn = document.createElement("button");
        newTabBtn.type = "button";
        newTabBtn.textContent = "↗ 새 탭";
        newTabBtn.style.cssText =
          "padding:2px 10px;border-radius:4px;font-size:11px;background:transparent;color:#6b7280;border:1px solid #e5e7eb;cursor:pointer";
        newTabBtn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        newTabBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const raw = (block.props as { html?: string }).html ?? "";
          if (!raw.trim()) return;
          const blob = new Blob([raw], { type: "text/html;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          setTimeout(() => URL.revokeObjectURL(url), 3000);
        });
        head.appendChild(newTabBtn);
        wrapper.appendChild(head);

        const previewWrap = document.createElement("div");
        previewWrap.className = "html-block-preview";
        previewWrap.style.cssText =
          "background:white;max-height:500px;overflow-y:auto;min-height:200px";

        const iframe = document.createElement("iframe");
        iframe.title = "HTML 미리보기";
        iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
        iframe.style.cssText = "width:100%;min-height:200px;border:none;display:block;background:white";
        const rawHtml = (block.props as { html?: string }).html ?? "";
        iframe.srcdoc = rawHtml;
        iframe.addEventListener("load", () => {
          try {
            const doc = iframe.contentWindow?.document;
            if (!doc?.documentElement) return;
            const h = Math.max(
              doc.documentElement.scrollHeight,
              doc.body?.scrollHeight ?? 0,
              200
            );
            iframe.style.height = `${h + 24}px`;
          } catch {
            /* ignore */
          }
        });
        previewWrap.appendChild(iframe);
        wrapper.appendChild(previewWrap);
      }

      return { dom: wrapper };
    },
    toExternalHTML(block) {
      const raw = (block.props as { html?: string }).html ?? "";
      const wrap = document.createElement("div");
      wrap.setAttribute("data-bn-html-block", "1");
      wrap.innerHTML = sanitizeNoteHtml(raw);
      return { dom: wrap };
    },
  })
);
