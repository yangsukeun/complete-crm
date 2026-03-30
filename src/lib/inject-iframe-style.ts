/**
 * iframe srcDoc 내부: 뷰포트·모바일 레이아웃(고정 너비 해제).
 * `<base>`는 html-iframe-preview에서 href와 함께 주입.
 */
const MOBILE_VIEWPORT_INJECT = `
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style data-crm-iframe-mobile="1">
  html {
    -webkit-text-size-adjust: 100%;
  }
  html, body {
    background: #fff !important;
    color: #000 !important;
    color-scheme: light !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
    box-sizing: border-box !important;
  }
  *, *::before, *::after {
    box-sizing: border-box !important;
    max-width: 100% !important;
  }
  body > * {
    max-width: 100% !important;
    overflow-x: hidden !important;
  }
  .container, .wrapper, .wrap,
  .inner, .content, main, section,
  header, footer, nav, article {
    max-width: 100% !important;
    width: 100% !important;
    padding-left: 16px !important;
    padding-right: 16px !important;
    box-sizing: border-box !important;
  }
  img, video, canvas, svg {
    max-width: 100% !important;
    height: auto !important;
  }
  table {
    max-width: 100% !important;
    display: block !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
  }
  body {
    font-size: max(14px, 1rem) !important;
    line-height: 1.6 !important;
  }
  a, button {
    min-height: 44px !important;
    display: inline-flex !important;
    align-items: center !important;
  }
</style>
`;

export function injectBaseStyleAndViewport(html: string): string {
  const t = (html ?? "").trim();
  if (!t) return html ?? "";
  if (/<head[\s>]/i.test(t)) {
    return t.replace(/<head([^>]*)>/i, `<head$1>${MOBILE_VIEWPORT_INJECT}`);
  }
  if (/<html[\s>]/i.test(t)) {
    return t.replace(/<html([^>]*)>/i, `<html$1><head>${MOBILE_VIEWPORT_INJECT}</head>`);
  }
  return `<head>${MOBILE_VIEWPORT_INJECT}</head>${t}`;
}
