import { injectBaseStyleAndViewport } from "@/lib/inject-iframe-style";

/** about:srcdoc 상대 URL이 부모 origin이 아닌 잘못된 문서 URL로 붙는 요청·404 방지 */
function injectSrcdocBaseHref(html: string, documentOrigin: string): string {
  const t = (html ?? "").trim();
  if (!t || !documentOrigin) return t;
  if (/<base[\s>]/i.test(t)) return t;
  const href = `${documentOrigin.replace(/\/$/, "")}/`;
  const baseTag = `<base href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" target="_blank">`;

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
  return injectBaseStyleAndViewport(t);
}
