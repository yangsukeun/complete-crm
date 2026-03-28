import { createBlockConfig, createBlockSpec, defaultProps } from "@blocknote/core";
import { sanitizeNoteHtml } from "@/lib/sanitize-note-html";

const createHtmlBlockConfig = createBlockConfig(() => ({
  type: "htmlBlock" as const,
  propSchema: {
    textAlignment: defaultProps.textAlignment,
    backgroundColor: defaultProps.backgroundColor,
    html: { default: "" as const },
    viewMode: { default: "code" as const },
  },
  content: "none" as const,
}));

export const createHtmlBlockSpec = createBlockSpec(
  createHtmlBlockConfig,
  () => ({
    render(block, editor) {
      const props = block.props as { html?: string; viewMode?: string };
      const html = props.html ?? "";
      const viewMode = props.viewMode === "preview" ? "preview" : "code";

      const wrapper = document.createElement("div");
      wrapper.className = "bn-html-block-wrapper";
      wrapper.setAttribute("data-html-block", "1");
      wrapper.style.cssText =
        "border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:8px 0;background:#fff";
      wrapper.setAttribute("contenteditable", "false");

      const header = document.createElement("div");
      header.style.cssText =
        "display:flex;align-items:center;gap:4px;padding:6px 8px;background:#f9fafb;border-bottom:1px solid #e5e7eb";
      const badge = document.createElement("span");
      badge.textContent = "🖥️ HTML";
      badge.style.cssText = "font-size:12px;color:#6b7280;margin-right:8px";
      header.appendChild(badge);

      const mkBtn = (label: string, mode: "code" | "preview") => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        btn.style.cssText = [
          "padding:2px 10px",
          "border-radius:4px",
          "font-size:12px",
          "border:none",
          "cursor:pointer",
          viewMode === mode ? "background:#6366f1;color:white" : "background:transparent;color:#6b7280",
        ].join(";");
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          editor.updateBlock(block, { props: { viewMode: mode } });
        });
        return btn;
      };
      header.appendChild(mkBtn("코드", "code"));
      header.appendChild(mkBtn("미리보기", "preview"));
      wrapper.appendChild(header);

      if (viewMode === "code") {
        const ta = document.createElement("textarea");
        ta.value = html;
        ta.placeholder = "HTML 코드를 입력하세요...";
        ta.style.cssText = [
          "width:100%",
          "min-height:200px",
          "padding:12px",
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
        ta.addEventListener("input", () => {
          editor.updateBlock(block, { props: { html: ta.value } });
        });
        wrapper.appendChild(ta);
      } else if (html.trim()) {
        const iframe = document.createElement("iframe");
        iframe.title = "HTML 미리보기";
        iframe.sandbox = "";
        iframe.style.cssText =
          "width:100%;min-height:200px;border:none;display:block;background:white";
        iframe.srcdoc = sanitizeNoteHtml(html);
        iframe.addEventListener("load", () => {
          try {
            const doc = iframe.contentWindow?.document?.body;
            if (doc) iframe.style.height = `${doc.scrollHeight + 40}px`;
          } catch {
            /* ignore */
          }
        });
        wrapper.appendChild(iframe);
      } else {
        const empty = document.createElement("div");
        empty.style.cssText =
          "padding:40px;text-align:center;color:#9ca3af;font-size:13px";
        empty.textContent = "코드 탭에서 HTML을 입력하면 여기에 미리보기가 표시됩니다";
        wrapper.appendChild(empty);
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
