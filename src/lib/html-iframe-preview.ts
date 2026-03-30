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

export function injectIframePreviewBaseStyle(html: string): string {
  const t = (html ?? "").trim();
  if (!t) return html ?? "";
  if (/<head[\s>]/i.test(t)) {
    return t.replace(/<head([^>]*)>/i, `<head$1>${IFRAME_BASE_STYLE}`);
  }
  if (/<html[\s>]/i.test(t)) {
    return t.replace(/<html([^>]*)>/i, `<html$1>${IFRAME_BASE_STYLE}`);
  }
  return `${IFRAME_BASE_STYLE}${t}`;
}
