/**
 * iframe srcDoc: PC 고정 폭(1200px)으로 레이아웃 → 부모에서 CSS scale로 모바일 대응.
 * `<base>`는 html-iframe-preview에서 href와 함께 주입.
 */
const DESKTOP_EMBED_LAYOUT_INJECT = `
<meta name="viewport" content="width=1200">
<style data-crm-iframe-desktop-embed="1">
  html {
    -webkit-text-size-adjust: 100%;
  }
  html, body {
    background: #fff !important;
    color: #000 !important;
    color-scheme: light !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 1200px !important;
    min-width: 1200px !important;
    max-width: none !important;
    box-sizing: border-box !important;
    /* 랜딩/복사 HTML이 height:100%/100vh·overflow:hidden 으로 본문 높이가 안 잡히는 경우 대비 */
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
    overflow-x: hidden !important;
    overflow-y: visible !important;
    position: relative !important;
  }
  *, *::before, *::after {
    box-sizing: border-box !important;
  }
  img, video, canvas, svg {
    max-width: 100% !important;
    height: auto !important;
  }
</style>
`;

export function injectBaseStyleAndViewport(html: string): string {
  const t = (html ?? "").trim();
  if (!t) return html ?? "";
  if (/<head[\s>]/i.test(t)) {
    return t.replace(/<head([^>]*)>/i, `<head$1>${DESKTOP_EMBED_LAYOUT_INJECT}`);
  }
  if (/<html[\s>]/i.test(t)) {
    return t.replace(/<html([^>]*)>/i, `<html$1><head>${DESKTOP_EMBED_LAYOUT_INJECT}</head>`);
  }
  return `<head>${DESKTOP_EMBED_LAYOUT_INJECT}</head>${t}`;
}
