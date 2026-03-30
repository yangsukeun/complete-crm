import { plainTextFromHtml, sanitizeNoteHtml } from "@/lib/sanitize-note-html";
import { parseStoredTaskBody } from "@/lib/task-body-description";

/**
 * 본문 전체가 마크다운 ```html … ``` 펜스 하나뿐이면 안쪽만 꺼냅니다.
 * (텍스트 모드로 붙여넣은 경우 미리보기가 코드 블록처럼 보이는 문제 완화)
 */
export function unwrapMarkdownHtmlCodeFence(s: string): string {
  const t = s.trim();
  const m = /^```(?:html)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i.exec(t);
  return m?.[1] != null ? m[1].trim() : s;
}

/**
 * DB·클라이언트 어디서나 동일 결과(하이드레이션 안전). `&amp;lt;p&amp;gt;` → `<p>` 형태까지 반복 해제.
 */
export function decodeCommonHtmlEntities(input: string): string {
  let t = input;
  for (let i = 0; i < 8; i++) {
    const prev = t;
    t = t.replace(/&amp;/g, "&");
    t = t.replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
    t = t.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    t = t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
    t = t.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    if (t === prev) break;
  }
  return t;
}

/** 기존 마크다운 본문과 구분해 HTML로 저장·표시할지 판별합니다. */
export function boardDescriptionLooksLikeHtml(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^<!DOCTYPE\s+html/i.test(t)) return true;
  if (/^<[a-z][a-z0-9:-]*(\s[^>]*)?>/i.test(t)) return true;
  if (
    /<[a-z][a-z0-9:-]*(\s[^>]*)?>/i.test(t) &&
    /<\/[a-z][a-z0-9]*\s*>/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * 저장 직전 본문 정규화.
 * - explicitType "html": 항상 DOMPurify
 * - "text": 마크다운 등 원문 유지(트림만)
 * - 생략 시: 기존 휴리스틱(HTML로 보이면 정제)
 */
export function normalizeBoardDescriptionForStore(raw: string, explicitType?: "text" | "html"): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (explicitType === "html") return sanitizeNoteHtml(t);
  if (explicitType === "text") return t;
  if (boardDescriptionLooksLikeHtml(t)) return sanitizeNoteHtml(t);
  return t;
}

function stripMarkdownPreviewPlain(text: string): string {
  return text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`[^`]+`/g, "")
    .replace(/\n/g, " ")
    .trim();
}

/** 목록 카드 미리보기용 (HTML → 텍스트, 마크다운 → 단순 제거) */
export function previewPlainTextForBoard(
  description: string | null | undefined,
  maxLen: number,
  contentType?: string | null
): string {
  const s = (description ?? "").trim();
  if (!s) return "";
  const asDoc = parseStoredTaskBody(s);
  if (asDoc?.format === "blocks") {
    return "본문에 HTML 블록·서식이 포함된 글입니다.".slice(0, maxLen);
  }
  const base =
    contentType === "html" || boardDescriptionLooksLikeHtml(s)
      ? plainTextFromHtml(s)
      : stripMarkdownPreviewPlain(s);
  if (base.length <= maxLen) return base;
  return base.slice(0, maxLen) + "…";
}
