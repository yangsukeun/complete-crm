import { normalizeBlockNoteBlocksForYoutube } from "@/lib/blocknote-normalize-youtube";

/**
 * 업무 본문 저장: 마크다운만 쓰면 토글·다열 등 BlockNote 블록 타입이 유지되지 않습니다.
 * 접두 + JSON 으로 블록 트리를 저장하고, 구 데이터는 마크다운으로 그대로 불러옵니다.
 */
export const TASK_BODY_DOC_PREFIX = "__BN_DOC_V1__\n";

/** 글 전체를 HTML 페이지로 저장할 때 description 접두 (Task.contentType 없이 구분) */
export const TASK_HTML_PAGE_PREFIX = "__HTML_PAGE_V1__\n";

export function isTaskHtmlPage(raw: string | null | undefined): boolean {
  return (raw ?? "").trim().startsWith(TASK_HTML_PAGE_PREFIX);
}

export function stripTaskHtmlPage(raw: string): string {
  if (!isTaskHtmlPage(raw)) return raw;
  return raw.slice(TASK_HTML_PAGE_PREFIX.length);
}

export function wrapTaskHtmlPage(html: string): string {
  return TASK_HTML_PAGE_PREFIX + html;
}

export function taskDescriptionContentType(raw: string | null | undefined): "text" | "html" {
  return isTaskHtmlPage(raw) ? "html" : "text";
}

export type ParsedStoredTaskBody =
  | { format: "blocks"; blocks: unknown[] }
  | { format: "markdown"; markdown: string };

/** DB/서버에서 온 문자열을 블록 JSON 또는 레거시 마크다운으로 구분 */
export function parseStoredTaskBody(raw: string | null | undefined): ParsedStoredTaskBody | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (t.startsWith(TASK_BODY_DOC_PREFIX)) {
    try {
      const parsed = JSON.parse(t.slice(TASK_BODY_DOC_PREFIX.length)) as {
        v?: number;
        blocks?: unknown[];
      };
      // v 검증 완화: blocks 배열만 있으면 구조화 본문으로 취급(@멘션 추출·에디터 로드 모두에 필요)
      if (Array.isArray(parsed?.blocks)) {
        return { format: "blocks", blocks: parsed.blocks };
      }
    } catch {
      /* 손상된 JSON은 마크다운으로 재시도 */
    }
    return { format: "markdown", markdown: raw ?? "" };
  }
  return { format: "markdown", markdown: raw ?? "" };
}

type EditorForSerialize = {
  document: unknown;
  /** BlockNote 제네릭과 맞추기 위해 any 허용 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocksToMarkdownLossy: (blocks?: any) => string;
};

/** 블록에 사용자가 넣은 내용이 있는지 (빈 기본 문단만이면 false) */
function blockHasContent(block: unknown): boolean {
  if (!block || typeof block !== "object") return false;
  const b = block as {
    type?: string;
    content?: unknown[];
    children?: unknown[];
    props?: Record<string, unknown>;
  };

  if (Array.isArray(b.children) && b.children.length > 0) {
    return b.children.some((c) => blockHasContent(c));
  }

  const typesWithUrl = new Set(["youtube", "linkPreview", "image", "video", "audio", "file"]);
  if (b.type && typesWithUrl.has(String(b.type))) {
    const url = (b.props as { url?: string } | undefined)?.url;
    return !!(url && String(url).trim());
  }

  if (b.type === "htmlBlock") {
    const html = (b.props as { html?: string } | undefined)?.html;
    return !!(html && String(html).trim());
  }

  if (!Array.isArray(b.content) || b.content.length === 0) return false;

  return b.content.some((item) => {
    if (!item || typeof item !== "object") return false;
    const o = item as { type?: string; text?: string };
    if (o.type === "text") return String(o.text ?? "").trim().length > 0;
    return true;
  });
}

/** 문서에 저장할 만한 내용이 있는지 */
function documentHasStoredContent(blocks: unknown[]): boolean {
  if (!Array.isArray(blocks) || blocks.length === 0) return false;
  return blocks.some((bl) => blockHasContent(bl));
}

/**
 * 에디터 내용을 DB에 넣을 문자열로 직렬화 (토글/다열 등 보존).
 * 완전히 비어 있으면 null (기존과 동일하게 빈 본문).
 *
 * - blocksToMarkdownLossy만 쓰면 @멘션·일부 블록이 빈 문자열로 나와 저장이 빠질 수 있음
 * - 블록 트리를 함께 보면 실질적인 공백만 null 처리
 */
export function serializeTaskBodyForStore(editor: EditorForSerialize): string | null {
  let blocks: unknown[];
  try {
    blocks = normalizeBlockNoteBlocksForYoutube(
      JSON.parse(JSON.stringify(editor.document)) as unknown[]
    );
  } catch {
    return null;
  }
  let md = "";
  try {
    md = editor.blocksToMarkdownLossy(editor.document).trim();
  } catch {
    md = "";
  }
  const hasStructuralContent = documentHasStoredContent(blocks);
  if (!md && !hasStructuralContent) return null;
  const payload = {
    v: 1 as const,
    blocks,
  };
  return TASK_BODY_DOC_PREFIX + JSON.stringify(payload);
}

/**
 * 목록·미리보기 등에서 원문이 JSON 포맷이면 짧은 안내만 표시 (선택).
 */
export function taskBodyPlainTextPreview(raw: string | null | undefined, maxLen = 120): string {
  const parsed = parseStoredTaskBody(raw);
  if (!parsed) return "";
  if (parsed.format === "markdown") {
    const s = parsed.markdown.replace(/\s+/g, " ").trim();
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  }
  const mdFromBlocks = "(구조화된 본문)";
  return mdFromBlocks;
}
