/**
 * 에디터(클라이언트)용 이미지 업로드·Drive 표시 URL 정규화.
 * — uc?export=view 는 브라우저 img 요청 시 HTML 뷰어가 올 때가 많아 엑박 → thumbnail API 사용.
 */
import { getNearestBlockPos } from "@blocknote/core";
import type { Node as ProseMirrorNode } from "prosemirror-model";
import { parseGoogleDriveFileIdFromUrl } from "@/lib/google-drive-url-utils";
import { postUploadFile } from "@/lib/upload-client-validate";

type EditorBlock = {
  id: string;
  type: string;
  content?: unknown;
  children?: EditorBlock[];
};

/** taskBodySchema·withMultiColumn 등 서로 다른 BlockNote 스키마 에디터 공용 */
export type BlockInsertEditor = {
  schema: {
    blockSchema: Record<string, { content?: string } | undefined>;
  };
  document: EditorBlock[];
  getTextCursorPosition: () => { block: EditorBlock };
  updateBlock: (block: EditorBlock, update: Record<string, unknown>) => void;
  insertBlocks: (
    blocks: Record<string, unknown>[],
    ref: EditorBlock,
    placement?: "before" | "after"
  ) => void;
  getBlock: (id: string) => EditorBlock | undefined;
  prosemirrorView?: {
    state: { doc: ProseMirrorNode };
    dom: Element;
    posAtCoords: (coords: { left: number; top: number }) => { pos: number } | null;
  };
};

export function normalizeDriveImageUrlForImgTag(url: string): string {
  const raw = String(url ?? "").trim();
  if (!raw || raw.startsWith("blob:") || raw.startsWith("data:")) return raw;
  const id = parseGoogleDriveFileIdFromUrl(raw);
  if (!id) return raw;
  if (/drive\.google\.com\/thumbnail\?/i.test(raw)) return raw;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`;
}

/** 클립보드에서 이미지 파일 추출 (캡처·파일 항목·image/* item) */
export function getClipboardImageFile(dt: DataTransfer): File | null {
  if (dt.files?.length) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      if (f?.type?.startsWith("image/")) return f;
    }
  }
  if (dt.items?.length) {
    for (let i = 0; i < dt.items.length; i++) {
      const it = dt.items[i];
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f && (f.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name))) {
          return f;
        }
      }
      if (it.type?.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) return f;
      }
    }
  }
  return null;
}

export function getFirstImageFileFromDataTransfer(dt: DataTransfer): File | null {
  const clip = getClipboardImageFile(dt);
  if (clip) return clip;
  if (dt.files?.length) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      if (f?.type?.startsWith("image/")) return f;
    }
  }
  return null;
}

export async function uploadImageViaApi(file: File): Promise<string> {
  const { url } = await postUploadFile(file);
  return normalizeDriveImageUrlForImgTag(url);
}

export function isParagraphEffectivelyEmpty(block: {
  type?: string;
  content?: unknown;
} | null): boolean {
  if (!block || block.type !== "paragraph") return false;
  const c = block.content;
  if (c == null || (Array.isArray(c) && c.length === 0)) return true;
  if (!Array.isArray(c)) return false;
  return c.every((item: unknown) => {
    const it = item as { type?: string; text?: string };
    if (it?.type === "text") return !(String(it.text ?? "").trim());
    return false;
  });
}

export function createPastedImageBlock(url: string, fileName: string) {
  return {
    type: "image" as const,
    props: {
      url,
      name: fileName.replace(/\s+/g, "-") || "image.png",
      caption: "",
      showPreview: true,
    },
  };
}

/** BlockNote le()와 동일: inline 블록이고 content가 비었는지 */
export function blockHasEmptyInlineContent(
  editor: Pick<BlockInsertEditor, "schema">,
  block: EditorBlock
): boolean {
  const spec = editor.schema.blockSchema[block.type];
  if (!spec || spec.content !== "inline") return false;
  const c = block.content;
  if (c == null || (Array.isArray(c) && c.length === 0)) return true;
  return isParagraphEffectivelyEmpty(block);
}

/** column/columnList 등 content:none 컨테이너면 실제 편집 대상 자식 블록으로 */
export function resolveImageInsertReferenceBlock(
  editor: Pick<BlockInsertEditor, "schema" | "document">,
  cursorBlock: EditorBlock | undefined
): EditorBlock | undefined {
  let ref = cursorBlock ?? editor.document[editor.document.length - 1];
  if (!ref) return undefined;

  for (let i = 0; i < 4; i++) {
    const spec = editor.schema.blockSchema[ref.type];
    if (spec?.content !== "none" || !ref.children?.length) break;
    const inlineChild = ref.children.find(
      (b) => editor.schema.blockSchema[b.type]?.content === "inline"
    );
    if (!inlineChild) break;
    ref = inlineChild;
  }
  return ref;
}

/** 커서 위치에 블록 삽입 — 다열 안에서 replaceBlocks 대신 updateBlock 사용 */
export function insertBlockAtTextCursor(
  editor: BlockInsertEditor,
  partialBlock: Record<string, unknown>,
  capturedCursorBlock?: EditorBlock
): void {
  const ref = resolveImageInsertReferenceBlock(
    editor,
    capturedCursorBlock ?? editor.getTextCursorPosition().block
  );
  if (!ref) throw new Error("삽입 위치를 찾을 수 없습니다.");

  if (blockHasEmptyInlineContent(editor, ref)) {
    editor.updateBlock(ref, partialBlock);
  } else {
    editor.insertBlocks([partialBlock], ref, "after");
  }
}

/** drop: 마우스 좌표 기준 삽입 */
export function insertBlockAtDropCoords(
  editor: BlockInsertEditor,
  partialBlock: Record<string, unknown>,
  clientX: number,
  clientY: number
): void {
  const view = editor.prosemirrorView;
  if (!view) throw new Error("에디터가 준비되지 않았습니다.");

  const coords = view.posAtCoords({ left: clientX, top: clientY });
  if (!coords) throw new Error("드롭 위치를 찾을 수 없습니다.");

  const { node } = getNearestBlockPos(view.state.doc, coords.pos);
  const blockId = node.attrs?.id as string | undefined;
  if (!blockId) throw new Error("드롭 위치 블록을 찾을 수 없습니다.");

  const ref = editor.getBlock(blockId);
  if (!ref) throw new Error("드롭 위치 블록을 찾을 수 없습니다.");

  const resolved = resolveImageInsertReferenceBlock(editor, ref);
  if (!resolved) throw new Error("삽입 위치를 찾을 수 없습니다.");

  const el = view.dom.querySelector(`[data-id="${blockId}"]`);
  const rect = el?.getBoundingClientRect();
  const placement =
    rect && (rect.top + rect.bottom) / 2 > clientY ? ("before" as const) : ("after" as const);

  if (blockHasEmptyInlineContent(editor, resolved)) {
    editor.updateBlock(resolved, partialBlock);
  } else {
    editor.insertBlocks([partialBlock], resolved, placement);
  }
}
