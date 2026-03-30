import {
  createBlockConfig,
  createBlockSpec,
  defaultProps,
  type BlockNoteEditor,
} from "@blocknote/core";
import { sanitizeNoteHtml } from "@/lib/sanitize-note-html";
import { injectIframePreviewBaseStyle } from "@/lib/html-iframe-preview";

/** 참고용(스키마는 createHtmlBlockConfig와 동기화) */
export const htmlEmbedBlockSpec = {
  type: "htmlBlock" as const,
  propSchema: {
    html: { default: "" },
  },
  content: "none" as const,
};

type HtmlBlockProps = { html?: string };
type HtmlBlockArg = { id: string; props: HtmlBlockProps };

/**
 * HTML 블록 DOM 렌더 (React 없음).
 * `readOnly`: 게시판 상세 등 읽기 전용 — 코드/탭 전환 UI 최소화.
 */
export function renderHtmlBlock(
  block: HtmlBlockArg,
  editor: BlockNoteEditor<any, any, any>,
  readOnly: boolean
) {
  const wrapper = document.createElement("div");
  wrapper.className = "bn-html-block-wrapper";
  wrapper.setAttribute("data-html-block", "1");
  wrapper.setAttribute("contenteditable", "false");
  /** overflow·width는 renderBody에서 모드별로 조정 (미리보기는 가로로 뷰포트까지 확장) */
  wrapper.style.cssText = `
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    margin: 4px 0;
    width: 100%;
  `;

  let resizeHandler: (() => void) | null = null;
  const clearPreviewResize = () => {
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      resizeHandler = null;
    }
  };

  const attachViewportAlignedPreview = (iframe: HTMLIFrameElement) => {
    clearPreviewResize();
    const sync = () => {
      const r = wrapper.getBoundingClientRect();
      const w = Math.max(280, window.innerWidth - r.left);
      iframe.style.width = `${w}px`;
      iframe.style.maxWidth = "none";
      iframe.style.boxSizing = "border-box";
      iframe.style.minHeight = `${Math.max(320, Math.round(window.innerHeight * 0.5))}px`;
    };
    sync();
    resizeHandler = sync;
    window.addEventListener("resize", resizeHandler);
  };

  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: #1e1e1e;
  `;

  const label = document.createElement("span");
  label.textContent = "</> HTML";
  label.style.cssText = `
    font-size: 11px;
    color: #888;
    font-family: monospace;
    margin-right: 6px;
  `;

  const mkBtn = (text: string, active = false) => {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.type = "button";
    btn.style.cssText = active
      ? `padding:2px 10px;border-radius:4px;font-size:11px;
         border:none;cursor:pointer;color:white;background:#6366f1;`
      : `padding:2px 10px;border-radius:4px;font-size:11px;
         border:1px solid #444;cursor:pointer;color:#aaa;background:transparent;`;
    return btn;
  };

  const codeBtn = mkBtn("코드");
  const previewBtn = mkBtn("미리보기");
  const newTabBtn = mkBtn("↗ 새 탭");
  newTabBtn.style.marginLeft = "auto";

  if (readOnly) {
    header.append(label, newTabBtn);
  } else {
    header.append(label, codeBtn, previewBtn, newTabBtn);
  }
  wrapper.appendChild(header);

  const body = document.createElement("div");
  wrapper.appendChild(body);

  let mode: "code" | "preview" = readOnly
    ? "preview"
    : block.props.html
      ? "preview"
      : "code";

  function updateBtns() {
    if (readOnly) return;
    codeBtn.style.background = mode === "code" ? "#6366f1" : "transparent";
    codeBtn.style.color = mode === "code" ? "white" : "#aaa";
    codeBtn.style.border = mode === "code" ? "none" : "1px solid #444";

    previewBtn.style.background = mode === "preview" ? "#6366f1" : "transparent";
    previewBtn.style.color = mode === "preview" ? "white" : "#aaa";
    previewBtn.style.border = mode === "preview" ? "none" : "1px solid #444";
  }

  function renderBody() {
    clearPreviewResize();
    body.innerHTML = "";
    updateBtns();

    if (readOnly) {
      const html = block.props.html ?? "";
      if (!html.trim()) {
        const p = document.createElement("p");
        p.style.cssText =
          "margin:0;padding:12px;font-size:12px;color:#888;background:#fafafa;";
        p.textContent = "(비어 있는 HTML 블록)";
        body.appendChild(p);
        return;
      }
      const iframe = document.createElement("iframe");
      iframe.title = "HTML 미리보기";
      iframe.srcdoc = injectIframePreviewBaseStyle(html);
      /* CRM 내부 작성 HTML 미리보기 — sandbox 제거(브라우저 동일 출처 경고 회피·리소스 로딩 허용) */
      iframe.style.cssText = `
        width: 100%;
        min-height: 200px;
        border: none;
        display: block;
        background: white;
        color-scheme: light;
      `;
      iframe.addEventListener("load", () => {
        try {
          const h =
            iframe.contentWindow?.document?.documentElement?.scrollHeight ??
            iframe.contentWindow?.document?.body?.scrollHeight;
          if (h && h > 60) {
            iframe.style.height = Math.max(
              h + 24,
              Math.round(window.innerHeight * 0.5)
            ) + "px";
          }
        } catch {
          /* ignore */
        }
      });
      wrapper.style.overflow = "visible";
      body.appendChild(iframe);
      attachViewportAlignedPreview(iframe);
      return;
    }

    if (mode === "code") {
      const ta = document.createElement("textarea");
      ta.value = block.props.html ?? "";
      ta.placeholder = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>body{font-family:sans-serif;padding:20px}</style>
</head>
<body>
  <h1>HTML 코드를 여기에 붙여넣으세요</h1>
</body>
</html>`;
      ta.style.cssText = `
        width: 100%;
        min-height: 220px;
        padding: 12px;
        font-family: monospace;
        font-size: 13px;
        background: #1e1e1e;
        color: #d4d4d4;
        border: none;
        outline: none;
        resize: vertical;
        display: block;
        box-sizing: border-box;
        line-height: 1.6;
      `;

      ta.addEventListener("input", () => {
        editor.updateBlock(block, {
          props: { html: ta.value },
        });
      });

      ta.addEventListener("blur", () => {
        if (ta.value.trim()) {
          mode = "preview";
          editor.updateBlock(block, {
            props: { html: ta.value },
          });
          renderBody();
        }
      });

      wrapper.style.overflow = "hidden";
      body.appendChild(ta);
      setTimeout(() => ta.focus(), 30);
    } else {
      if (!block.props.html) {
        mode = "code";
        renderBody();
        return;
      }

      const iframe = document.createElement("iframe");
      iframe.title = "HTML 미리보기";
      iframe.srcdoc = injectIframePreviewBaseStyle(block.props.html ?? "");
      iframe.style.cssText = `
        width: 100%;
        min-height: 200px;
        border: none;
        display: block;
        background: white;
        color-scheme: light;
      `;

      iframe.addEventListener("load", () => {
        try {
          const h =
            iframe.contentWindow?.document?.documentElement?.scrollHeight ??
            iframe.contentWindow?.document?.body?.scrollHeight;
          if (h && h > 60) {
            iframe.style.height = Math.max(
              h + 24,
              Math.round(window.innerHeight * 0.5)
            ) + "px";
          }
        } catch {
          /* ignore */
        }
      });

      wrapper.style.overflow = "visible";
      /** 투명 오버레이는 iframe 클릭·스크롤·내부 미리보기를 전부 막음 → 편집은 '코드' 버튼으로만 전환 */
      body.appendChild(iframe);
      attachViewportAlignedPreview(iframe);
    }
  }

  if (!readOnly) {
    codeBtn.addEventListener("click", () => {
      mode = "code";
      renderBody();
    });

    previewBtn.addEventListener("click", () => {
      if (block.props.html) {
        mode = "preview";
        renderBody();
      } else {
        mode = "code";
        renderBody();
      }
    });
  }

  newTabBtn.addEventListener("click", () => {
    const html = block.props.html;
    if (!html) return;
    const blob = new Blob([injectIframePreviewBaseStyle(html)], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });

  renderBody();

  return {
    dom: wrapper,
    destroy() {
      clearPreviewResize();
      body.innerHTML = "";
    },
  };
}

const createHtmlBlockConfig = createBlockConfig(() => ({
  type: "htmlBlock" as const,
  propSchema: {
    textAlignment: defaultProps.textAlignment,
    backgroundColor: defaultProps.backgroundColor,
    html: { default: "" as const },
  },
  content: "none" as const,
}));

export const createHtmlBlockSpec = createBlockSpec(
  createHtmlBlockConfig,
  () => ({
    render(block, editor) {
      const readOnly = !editor.isEditable;
      return renderHtmlBlock(block as HtmlBlockArg, editor, readOnly);
    },
    toExternalHTML(block) {
      const raw = (block.props as HtmlBlockProps).html ?? "";
      const wrap = document.createElement("div");
      wrap.setAttribute("data-bn-html-block", "1");
      wrap.innerHTML = sanitizeNoteHtml(raw);
      return { dom: wrap };
    },
  })
);
