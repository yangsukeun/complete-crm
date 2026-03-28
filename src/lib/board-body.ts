import { plainTextFromHtml, sanitizeNoteHtml } from "@/lib/sanitize-note-html";
import { parseStoredTaskBody } from "@/lib/task-body-description";

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
