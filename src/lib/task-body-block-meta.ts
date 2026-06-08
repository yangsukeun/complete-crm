import type { BlockMetaEntry } from "@/components/body-meta-block-rail";

/** 블록(최상위 행)별 작성·수정자 — description JSON `blockMeta`에 저장 */
export type StoredBlockMeta = {
  authorId: string;
  authorName: string;
  createdAt: string;
  editorId: string;
  editorName: string;
  updatedAt: string;
};

export type TaskBodyBlockMetaMap = Record<string, StoredBlockMeta>;

export type BlockMetaUser = {
  id: string;
  name: string;
};

export function storedBlockMetaToEntry(stored: StoredBlockMeta): BlockMetaEntry {
  return {
    authorName: stored.authorName,
    editorName: stored.editorName,
    createdAtIso: stored.createdAt,
    updatedAtIso: stored.updatedAt,
  };
}

export function blockMetaMapToDisplay(
  blockMeta: TaskBodyBlockMetaMap | null | undefined
): Record<string, BlockMetaEntry> {
  if (!blockMeta) return {};
  const out: Record<string, BlockMetaEntry> = {};
  for (const [id, stored] of Object.entries(blockMeta)) {
    out[id] = storedBlockMetaToEntry(stored);
  }
  return out;
}

/** 커서 블록이 속한 최상위(본문 행) 블록 id */
export function resolveTopLevelBlockId(
  editor: { getParentBlock: (id: string) => { id: string } | undefined },
  blockId: string
): string {
  let current = blockId;
  for (let depth = 0; depth < 64; depth++) {
    const parent = editor.getParentBlock(current);
    if (!parent) return current;
    current = parent.id;
  }
  return current;
}

export function getTopLevelBlockIds(document: Array<{ id: string }>): string[] {
  return document.map((b) => b.id);
}

/** 삭제된 블록 메타 제거 */
export function pruneBlockMeta(
  blockMeta: TaskBodyBlockMetaMap,
  topLevelBlockIds: string[]
): TaskBodyBlockMetaMap {
  const keep = new Set(topLevelBlockIds);
  const next: TaskBodyBlockMetaMap = {};
  for (const [id, meta] of Object.entries(blockMeta)) {
    if (keep.has(id)) next[id] = meta;
  }
  return next;
}

/** 편집 중인 최상위 블록에 작성자·수정자 스탬프 */
export function stampTopLevelBlockMeta(
  editor: {
    getTextCursorPosition: () => { block: { id: string } };
    getParentBlock: (id: string) => { id: string } | undefined;
  },
  blockMeta: TaskBodyBlockMetaMap,
  user: BlockMetaUser,
  nowIso = new Date().toISOString()
): TaskBodyBlockMetaMap {
  const cursor = editor.getTextCursorPosition().block;
  const topLevelId = resolveTopLevelBlockId(editor, cursor.id);
  const name = user.name.trim() || "—";
  const existing = blockMeta[topLevelId];

  if (!existing) {
    return {
      ...blockMeta,
      [topLevelId]: {
        authorId: user.id,
        authorName: name,
        createdAt: nowIso,
        editorId: user.id,
        editorName: name,
        updatedAt: nowIso,
      },
    };
  }

  return {
    ...blockMeta,
    [topLevelId]: {
      ...existing,
      editorId: user.id,
      editorName: name,
      updatedAt: nowIso,
    },
  };
}

export function parseBlockMetaFromPayload(
  payload: { blockMeta?: unknown } | null | undefined
): TaskBodyBlockMetaMap | undefined {
  const raw = payload?.blockMeta;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

  const out: TaskBodyBlockMetaMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const m = value as Partial<StoredBlockMeta>;
    if (
      typeof m.authorId !== "string" ||
      typeof m.authorName !== "string" ||
      typeof m.createdAt !== "string" ||
      typeof m.editorId !== "string" ||
      typeof m.editorName !== "string" ||
      typeof m.updatedAt !== "string"
    ) {
      continue;
    }
    out[id] = {
      authorId: m.authorId,
      authorName: m.authorName,
      createdAt: m.createdAt,
      editorId: m.editorId,
      editorName: m.editorName,
      updatedAt: m.updatedAt,
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
