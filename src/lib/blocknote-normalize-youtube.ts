import { getYoutubeVideoId } from "@/lib/blocknote-youtube";

function isYoutubeWatchUrl(url: string): boolean {
  return getYoutubeVideoId(url) != null;
}

function youtubePropsFrom(
  url: string,
  base: Record<string, unknown>
): Record<string, unknown> {
  return {
    url,
    caption: typeof base.caption === "string" ? base.caption : "",
    textAlignment: base.textAlignment ?? "left",
    backgroundColor: base.backgroundColor ?? "default",
  };
}

/** paragraph 인라인에서 YouTube URL 한 가지만 있으면 URL 추출 */
function youtubeUrlFromParagraphContent(content: unknown[] | undefined): string | null {
  if (!Array.isArray(content) || content.length !== 1) return null;
  const first = content[0] as Record<string, unknown>;
  if (first.type === "text" && typeof first.text === "string") {
    const t = first.text.trim();
    if (t && isYoutubeWatchUrl(t) && /^https?:\/\//i.test(t)) return t;
  }
  if (first.type === "link" && typeof first.href === "string" && isYoutubeWatchUrl(first.href)) {
    return first.href.trim();
  }
  return null;
}

/**
 * BlockNote 기본 `video` 블록 + YouTube 페이지 URL = 재생 불가(HTML을 video src로 씀).
 * 표시·저장 전에 `youtube`(iframe) 블록으로 바꿉니다.
 * 본문에 YouTube URL만 있는 단락도 임베드로 승격합니다.
 */
export function normalizeBlockNoteBlocksForYoutube(blocks: unknown[]): unknown[] {
  return blocks.map((block) => mapBlockDeep(block));
}

function mapBlockDeep(block: unknown): unknown {
  if (!block || typeof block !== "object") return block;
  const b = block as Record<string, unknown>;
  const props = (b.props ?? {}) as Record<string, unknown>;
  const url = typeof props.url === "string" ? props.url.trim() : "";

  const childrenRaw = b.children;
  const children = Array.isArray(childrenRaw)
    ? (childrenRaw as unknown[]).map(mapBlockDeep)
    : undefined;

  if (b.type === "video" && url && isYoutubeWatchUrl(url)) {
    return {
      ...b,
      type: "youtube",
      props: youtubePropsFrom(url, props),
      children: [],
    };
  }

  if (b.type === "paragraph" || b.type === "heading") {
    const yt = youtubeUrlFromParagraphContent(b.content as unknown[] | undefined);
    if (yt) {
      return {
        id: b.id,
        type: "youtube",
        props: youtubePropsFrom(yt, props),
        children: [],
      };
    }
  }

  if (children !== undefined && Array.isArray(childrenRaw)) {
    return { ...b, children };
  }
  return b;
}
