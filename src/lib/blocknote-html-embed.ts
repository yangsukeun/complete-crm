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

/** iframe 높이 자동 조절 — 로드 직후·이미지·폰트·레이아웃 변경까지 대응 */
function attachHtmlPreviewIframeAutoResize(iframe: HTMLIFrameElement) {
  let resizeObserver: ResizeObserver | null = null;

  const resizeIframe = () => {
    try {
      const doc = iframe.contentWindow?.document;
      if (!doc) return;

      const h = Math.max(
        doc.body?.scrollHeight ?? 0,
        doc.documentElement?.scrollHeight ?? 0,
        300
      );
      iframe.style.height = `${h}px`;
    } catch {
      /* cross-origin 또는 문서 미준비 */
    }
  };

  iframe.addEventListener("load", () => {
    resizeObserver?.disconnect();
    resizeObserver = null;

    resizeIframe();
    setTimeout(resizeIframe, 300);
    setTimeout(resizeIframe, 1000);

    try {
      const body = iframe.contentDocument?.body;
      if (body) {
        resizeObserver = new ResizeObserver(resizeIframe);
        resizeObserver.observe(body);
      }
    } catch {
      /* ignore */
    }
  });
}

/**
 * HTML 블록 DOM 렌더 (React 없음).
 * 편집: 툴바 + textarea(코드) + iframe(미리보기) 단일 트리, 토글만 표시 전환.
 * 읽기 전용: 라벨·새 탭 + iframe만.
 */
export function renderHtmlBlock(
  block: HtmlBlockArg,
  editor: BlockNoteEditor<any, any, any>,
  readOnly: boolean
) {
  if (readOnly) {
    const wrapper = document.createElement("div");
    wrapper.className = "bn-html-block-wrapper";
    wrapper.setAttribute("data-html-block", "1");
    wrapper.setAttribute("contenteditable", "false");
    wrapper.style.cssText = `
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      margin: 8px 0;
      background: white;
      width: 100%;
    `;

    const toolbar = document.createElement("div");
    toolbar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: #1e1e1e;
      border-bottom: 1px solid #333;
    `;
    const label = document.createElement("span");
    label.textContent = "</> HTML";
    label.style.cssText = `
      font-size: 11px;
      color: #888;
      font-family: monospace;
      margin-right: 8px;
    `;
    const newTabBtn = document.createElement("button");
    newTabBtn.textContent = "↗ 새 탭";
    newTabBtn.type = "button";
    newTabBtn.style.cssText = `
      padding: 2px 10px;
      border-radius: 4px;
      font-size: 12px;
      border: 1px solid #444;
      cursor: pointer;
      background: transparent;
      color: #888;
      margin-left: auto;
    `;
    toolbar.appendChild(label);
    toolbar.appendChild(newTabBtn);
    wrapper.appendChild(toolbar);

    const html = block.props.html ?? "";
    if (!html.trim()) {
      const empty = document.createElement("p");
      empty.style.cssText =
        "margin:0;padding:12px;font-size:12px;color:#888;background:#fafafa;";
      empty.textContent = "(비어 있는 HTML 블록)";
      wrapper.appendChild(empty);
    } else {
      const iframe = document.createElement("iframe");
      iframe.title = "HTML 미리보기";
      iframe.srcdoc = injectIframePreviewBaseStyle(html);
      iframe.style.cssText = `
        width: 100%;
        min-height: 200px;
        border: none;
        display: block;
        background: white;
        color-scheme: light;
      `;
      attachHtmlPreviewIframeAutoResize(iframe);
      wrapper.appendChild(iframe);
    }

    newTabBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const raw = block.props.html ?? "";
      if (!raw.trim()) return;
      const blob = new Blob([injectIframePreviewBaseStyle(raw)], {
        type: "text/html;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    });

    return {
      dom: wrapper,
      destroy() {
        /* BlockNote가 DOM 제거 */
      },
    };
  }

  const wrapper = document.createElement("div");
  wrapper.className = "bn-html-block-wrapper";
  wrapper.setAttribute("data-html-block", "1");
  wrapper.setAttribute("contenteditable", "false");
  wrapper.style.cssText = `
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    margin: 8px 0;
    background: white;
    width: 100%;
  `;

  const toolbar = document.createElement("div");
  toolbar.style.cssText = `
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: #1e1e1e;
    border-bottom: 1px solid #333;
  `;

  const label = document.createElement("span");
  label.textContent = "</> HTML";
  label.style.cssText = `
    font-size: 11px;
    color: #888;
    font-family: monospace;
    margin-right: 8px;
  `;

  const codeBtn = document.createElement("button");
  codeBtn.textContent = "코드";
  codeBtn.type = "button";

  const previewBtn = document.createElement("button");
  previewBtn.textContent = "미리보기";
  previewBtn.type = "button";

  const newTabBtn = document.createElement("button");
  newTabBtn.textContent = "↗ 새 탭";
  newTabBtn.type = "button";

  const baseToggleStyle = `
    padding: 2px 10px;
    border-radius: 4px;
    font-size: 12px;
    border: none;
    cursor: pointer;
    background: transparent;
    color: #888;
  `;

  const setActiveBtn = (active: "code" | "preview") => {
    codeBtn.style.cssText = baseToggleStyle;
    previewBtn.style.cssText = baseToggleStyle;
    const activeBtn = active === "code" ? codeBtn : previewBtn;
    activeBtn.style.background = "#6366f1";
    activeBtn.style.color = "white";
  };

  newTabBtn.style.cssText = `
    padding: 2px 10px;
    border-radius: 4px;
    font-size: 12px;
    border: 1px solid #444;
    cursor: pointer;
    background: transparent;
    color: #888;
    margin-left: auto;
  `;

  toolbar.appendChild(label);
  toolbar.appendChild(codeBtn);
  toolbar.appendChild(previewBtn);
  toolbar.appendChild(newTabBtn);

  const textarea = document.createElement("textarea");
  textarea.value = block.props.html ?? "";
  textarea.placeholder = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>body { font-family: sans-serif; }</style>
</head>
<body>
  <h1>HTML 코드를 여기에 입력하세요</h1>
</body>
</html>`;
  textarea.style.cssText = `
    width: 100%;
    min-height: 200px;
    padding: 12px 16px;
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

  const iframe = document.createElement("iframe");
  iframe.title = "HTML 미리보기";
  iframe.style.cssText = `
    width: 100%;
    min-height: 200px;
    border: none;
    display: block;
    background: white;
    color-scheme: light;
  `;

  let mode: "code" | "preview" = block.props.html?.trim() ? "preview" : "code";

  const updateIframe = (html: string) => {
    iframe.srcdoc = injectIframePreviewBaseStyle(html);
  };

  attachHtmlPreviewIframeAutoResize(iframe);

  const showCode = () => {
    mode = "code";
    textarea.style.display = "block";
    iframe.style.display = "none";
    setActiveBtn("code");
    setTimeout(() => textarea.focus(), 50);
  };

  const showPreview = () => {
    mode = "preview";
    textarea.style.display = "none";
    iframe.style.display = "block";
    setActiveBtn("preview");
    const v = textarea.value.trim();
    if (v) {
      editor.updateBlock(block, { props: { html: textarea.value } });
      updateIframe(textarea.value);
    } else {
      iframe.srcdoc = "";
    }
  };

  codeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showCode();
  });

  previewBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showPreview();
  });

  newTabBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const html = textarea.value.trim() || (block.props.html ?? "").trim();
    if (!html) return;
    const blob = new Blob([injectIframePreviewBaseStyle(html)], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  });

  textarea.addEventListener("keydown", (e) => {
    e.stopPropagation();
  });
  textarea.addEventListener("paste", (e) => {
    e.stopPropagation();
  });
  textarea.addEventListener("input", (e) => {
    e.stopPropagation();
    editor.updateBlock(block, {
      props: { html: textarea.value },
    });
  });
  textarea.addEventListener("blur", () => {
    if (textarea.value.trim()) {
      editor.updateBlock(block, {
        props: { html: textarea.value },
      });
      showPreview();
    }
  });

  wrapper.appendChild(toolbar);
  wrapper.appendChild(textarea);
  wrapper.appendChild(iframe);

  if (mode === "preview") {
    showPreview();
  } else {
    showCode();
  }

  return {
    dom: wrapper,
    destroy() {
      /* BlockNote가 DOM 제거 */
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
