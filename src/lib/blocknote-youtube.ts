import { createBlockConfig, createBlockSpec, defaultBlockSpecs, defaultProps } from "@blocknote/core";
import { createHtmlBlockSpec } from "@/lib/blocknote-html-embed";
import { fetchLinkPreviewCached } from "@/lib/link-preview-client-cache";

/**
 * YouTube 영상 ID 추출 (watch, youtu.be, embed, shorts, music 등)
 */
export function getYoutubeVideoId(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const u = url.trim();

  let m = u.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (m) return m[1];
  m = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i);
  if (m) return m[1];
  m = u.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i);
  if (m) return m[1];
  m = u.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/i);
  if (m) return m[1];
  // watch?v=ID / &v=ID (파라미터 순서 무관)
  const vMatch = u.match(/[?&]v=([a-zA-Z0-9_-]{11})(?:&|#|$)/i);
  if (vMatch) return vMatch[1];
  // 일부 모바일/리다이렉트 URL
  m = u.match(/youtube\.com\/watch\?[^#]*vi?=([a-zA-Z0-9_-]{11})/i);
  if (m) return m[1];

  return null;
}

function isYoutubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url || "");
}

function safeText(s: string): string {
  return String(s ?? "").replace(/[<>&]/g, (ch) => (ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&amp;"));
}

const createYoutubeBlockConfig = createBlockConfig(() => ({
  type: "youtube" as const,
  propSchema: {
    textAlignment: defaultProps.textAlignment,
    backgroundColor: defaultProps.backgroundColor,
    url: { default: "" as const },
    caption: { default: "" as const },
  },
  content: "none" as const,
}));

export const createYoutubeBlockSpec = createBlockSpec(
  createYoutubeBlockConfig,
  () => ({
    render(block, _editor) {
      const wrapper = document.createElement("div");
      wrapper.className = "bn-youtube-embed-wrapper";
      const url = (block.props as { url?: string }).url || "";
      const videoId = getYoutubeVideoId(url);

      if (videoId) {
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube.com/embed/${videoId}`;
        iframe.title = "YouTube video";
        iframe.width = "560";
        iframe.height = "315";
        iframe.frameBorder = "0";
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        iframe.allowFullscreen = true;
        iframe.setAttribute("contenteditable", "false");
        iframe.style.maxWidth = "100%";
        wrapper.appendChild(iframe);
      } else if (url) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = isYoutubeUrl(url) ? "YouTube 링크 (영상 ID를 확인해 주세요)" : url;
        wrapper.appendChild(link);
      } else {
        const placeholder = document.createElement("p");
        placeholder.className = "text-muted-foreground";
        placeholder.textContent = "YouTube URL을 입력하세요 (예: https://www.youtube.com/watch?v=...)";
        wrapper.appendChild(placeholder);
      }

      return { dom: wrapper };
    },
    toExternalHTML(block) {
      const url = (block.props as { url?: string }).url || "";
      const videoId = getYoutubeVideoId(url);
      const div = document.createElement("div");
      if (videoId) {
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube.com/embed/${videoId}`;
        iframe.width = "560";
        iframe.height = "315";
        iframe.frameBorder = "0";
        iframe.allowFullscreen = true;
        div.appendChild(iframe);
      } else {
        const a = document.createElement("a");
        a.href = url || "#";
        a.textContent = url || "YouTube";
        div.appendChild(a);
      }
      return { dom: div };
    },
  }),
);

const createLinkPreviewBlockConfig = createBlockConfig(() => ({
  type: "linkPreview" as const,
  propSchema: {
    textAlignment: defaultProps.textAlignment,
    backgroundColor: defaultProps.backgroundColor,
    url: { default: "" as const },
  },
  content: "none" as const,
}));

export const createLinkPreviewBlockSpec = createBlockSpec(
  createLinkPreviewBlockConfig,
  () => ({
    render(block) {
      const wrapper = document.createElement("div");
      wrapper.className = "bn-link-preview-wrapper";
      wrapper.style.maxWidth = "100%";
      const url = (block.props as { url?: string }).url || "";

      const card = document.createElement("div");
      card.className =
        "rounded-lg border bg-card p-3 flex gap-3 items-start hover:bg-muted/30 transition-colors";
      card.setAttribute("contenteditable", "false");

      const img = document.createElement("img");
      img.className = "h-14 w-14 rounded object-cover border bg-muted hidden";
      img.alt = "";

      const body = document.createElement("div");
      body.className = "min-w-0 flex-1";

      const title = document.createElement("div");
      title.className = "font-medium text-sm truncate";
      title.textContent = url ? "미리보기 불러오는 중..." : "URL을 입력하세요";

      const desc = document.createElement("div");
      desc.className = "text-xs text-muted-foreground line-clamp-2 mt-1";
      desc.textContent = url ? "" : "예: https://...";

      const footer = document.createElement("div");
      footer.className = "text-[10px] text-muted-foreground mt-2 truncate";
      footer.textContent = url;

      body.appendChild(title);
      body.appendChild(desc);
      body.appendChild(footer);
      card.appendChild(img);
      card.appendChild(body);

      if (url) {
        card.style.cursor = "pointer";
        card.addEventListener("click", () => {
          window.open(url, "_blank", "noopener,noreferrer");
        });
        const ytIdEarly = getYoutubeVideoId(url);
        if (ytIdEarly) {
          title.textContent = "YouTube 동영상";
          img.src = `https://img.youtube.com/vi/${ytIdEarly}/hqdefault.jpg`;
          img.classList.remove("hidden");
          footer.textContent = `YouTube · ${url}`;
        }
        void fetchLinkPreviewCached(url).then((data) => {
          if (!data) {
            if (!ytIdEarly) title.textContent = url;
            return;
          }
          title.textContent = data.title || title.textContent || url;
          desc.textContent = data.description || "";
          footer.textContent = data.siteName ? `${data.siteName} · ${url}` : url;
          if (data.image) {
            img.src = data.image;
            img.classList.remove("hidden");
          }
        });
      }

      wrapper.appendChild(card);
      return { dom: wrapper };
    },
    toExternalHTML(block) {
      const url = (block.props as { url?: string }).url || "";
      const div = document.createElement("div");
      div.innerHTML = `<a href="${safeText(url)}">${safeText(url || "링크")}</a>`;
      return { dom: div };
    },
  })
);

export const taskBodyBlockSpecs = {
  ...defaultBlockSpecs,
  youtube: createYoutubeBlockSpec(),
  linkPreview: createLinkPreviewBlockSpec(),
  htmlBlock: createHtmlBlockSpec(),
};
