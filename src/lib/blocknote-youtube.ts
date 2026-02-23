import {
  BlockNoteSchema,
  createBlockConfig,
  createBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultProps,
  defaultStyleSpecs,
} from "@blocknote/core";

/** Extract YouTube video ID from url (youtube.com/watch?v=ID, youtu.be/ID) */
function getYoutubeVideoId(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const u = url.trim();
  const m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function isYoutubeUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/i.test(url || "");
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

export const taskBodyBlockSpecs = {
  ...defaultBlockSpecs,
  youtube: createYoutubeBlockSpec(),
};

export const taskBodySchema = BlockNoteSchema.create({
  blockSpecs: taskBodyBlockSpecs,
  inlineContentSpecs: defaultInlineContentSpecs,
  styleSpecs: defaultStyleSpecs,
});
