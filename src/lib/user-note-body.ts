import { sanitizeNoteHtml } from "@/lib/sanitize-note-html";

export function normalizeUserNoteContent(raw: string, contentType: "text" | "html"): string {
  const t = raw ?? "";
  if (contentType === "html") return sanitizeNoteHtml(t);
  return t.trim();
}
