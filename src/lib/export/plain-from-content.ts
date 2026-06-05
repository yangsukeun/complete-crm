import { isTaskHtmlPage, stripTaskHtmlPage } from "@/lib/task-body-description";

/**
 * 프로젝트 본문(HTML/텍스트)·업무 BlockNote JSON 등을 PDF/PPT용 평문으로 축약.
 */

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function walkBlockNoteBlocks(blocks: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(blocks)) return out;
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const block = b as Record<string, unknown>;
    const content = block.content;
    if (Array.isArray(content)) {
      for (const inline of content) {
        if (inline && typeof inline === "object" && "text" in inline) {
          const t = (inline as { text?: string }).text;
          if (typeof t === "string" && t.trim()) out.push(t.trim());
        }
      }
    }
    const children = block.children;
    if (Array.isArray(children)) out.push(...walkBlockNoteBlocks(children));
  }
  return out;
}

/** BlockNote 문서 JSON 또는 배열에서 텍스트만 추출 */
export function plainTextFromBlockNoteJson(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return raw;
  try {
    const j = JSON.parse(t) as unknown;
    const blocks = Array.isArray(j) ? j : (j as { content?: unknown[] })?.content;
    if (!Array.isArray(blocks)) return raw;
    return walkBlockNoteBlocks(blocks).join("\n").trim() || raw.slice(0, 8000);
  } catch {
    return raw;
  }
}

/**
 * @param raw DB 문자열
 * @param contentType 프로젝트 등: `html` | 그 외. 업무 설명은 보통 JSON(BlockNote) 또는 null.
 */
export function contentToPlainText(raw: string | null | undefined, contentType?: string | null): string {
  if (raw == null || String(raw).trim() === "") return "";
  let s = String(raw);
  if (isTaskHtmlPage(s)) {
    s = stripTaskHtmlPage(s);
    return stripHtml(s);
  }
  if (contentType === "html") return stripHtml(s);
  if (s.trim().startsWith("{") || s.trim().startsWith("[")) return plainTextFromBlockNoteJson(s);
  return s.trim();
}
