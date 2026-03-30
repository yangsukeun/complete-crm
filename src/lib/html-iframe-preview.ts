/**
 * iframe srcDoc용: 부모 페이지 다크모드/color-scheme이 문서에 전이되지 않도록 기본 라이트 배경 주입.
 */
const IFRAME_BASE_STYLE = `
<style data-crm-iframe-preview-base="1">
  html, body {
    background: #fff !important;
    color: #111 !important;
    color-scheme: light !important;
  }
</style>
`;

/** about:srcdoc 상대 URL이 부모 origin이 아닌 잘못된 문서 URL로 붙는 요청·404 방지 */
function injectSrcdocBaseHref(html: string, documentOrigin: string): string {
  const t = (html ?? "").trim();
  if (!t || !documentOrigin) return t;
  if (/<base[\s>]/i.test(t)) return t;
  const href = `${documentOrigin.replace(/\/$/, "")}/`;
  const baseTag = `<base href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`;

  if (/<head[\s>]/i.test(t)) {
    return t.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }
  if (/<html[\s>]/i.test(t)) {
    return t.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
  }
  return `${baseTag}${t}`;
}

export type IframePreviewOptions = {
  /** 예: window.location.origin — 있으면 head(또는 문서 앞)에 base href 주입 */
  documentOrigin?: string;
};

export function injectIframePreviewBaseStyle(html: string, opts?: IframePreviewOptions): string {
  let t = (html ?? "").trim();
  if (!t) return html ?? "";
  if (opts?.documentOrigin) {
    t = injectSrcdocBaseHref(t, opts.documentOrigin);
  }
  if (/<head[\s>]/i.test(t)) {
    return t.replace(/<head([^>]*)>/i, `<head$1>${IFRAME_BASE_STYLE}`);
  }
  if (/<html[\s>]/i.test(t)) {
    return t.replace(/<html([^>]*)>/i, `<html$1>${IFRAME_BASE_STYLE}`);
  }
  return `${IFRAME_BASE_STYLE}${t}`;
}
