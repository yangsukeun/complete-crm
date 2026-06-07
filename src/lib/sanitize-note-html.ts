import DOMPurify from "isomorphic-dompurify";

export type SanitizeNoteHtmlOptions = {
  /** 게시판·업무 HTML 탭 등 전체 페이지 — style·link·svg 허용 */
  asHtmlPage?: boolean;
};

function isFullHtmlDocument(html: string): boolean {
  const t = html.trim();
  return /^<!DOCTYPE\s+html/i.test(t) || /^<html[\s>]/i.test(t);
}

function needsRichHtmlSanitize(html: string): boolean {
  const t = html.trim();
  return (
    isFullHtmlDocument(t) ||
    /<style[\s>]/i.test(t) ||
    /<link[\s>]/i.test(t) ||
    /<svg[\s>]/i.test(t)
  );
}

const RICH_HTML_ATTR = [
  "href",
  "rel",
  "type",
  "media",
  "crossorigin",
  "integrity",
  "viewBox",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "xmlns",
  "preserveAspectRatio",
  "points",
  "transform",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "class",
  "id",
  "style",
  "role",
  "aria-hidden",
  "aria-label",
  "clip-path",
  "marker-end",
  "marker-start",
];

function sanitizeRichHtml(html: string): string {
  const t = html.trim();
  const input = isFullHtmlDocument(t)
    ? t
    : `<html><head></head><body>${t}</body></html>`;

  const sanitized = DOMPurify.sanitize(input, {
    WHOLE_DOCUMENT: true,
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_TAGS: ["link", "style"],
    ADD_ATTR: RICH_HTML_ATTR,
    ALLOW_DATA_ATTR: true,
  });

  if (!isFullHtmlDocument(t)) {
    const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(sanitized);
    return bodyMatch ? bodyMatch[1].trim() : sanitized;
  }
  return sanitized;
}

export function sanitizeNoteHtml(html: string, options?: SanitizeNoteHtmlOptions): string {
  const t = (html ?? "").trim();
  if (!t) return "";

  const useRich =
    options?.asHtmlPage === true ||
    (options?.asHtmlPage !== false && needsRichHtmlSanitize(t));

  if (useRich) {
    return sanitizeRichHtml(t);
  }

  return DOMPurify.sanitize(t, {
    USE_PROFILES: { html: true },
  });
}

export function plainTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
