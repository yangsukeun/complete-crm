/**
 * 탐색기 새 폴더 생성 (클라이언트)
 * 툴바·폴더 피커가 동일 API를 재사용.
 */
export type ExplorerFolderCreated = {
  id: string;
  driveFileId: string;
  name: string;
  mimeType: string | null;
  size: null;
  isFolder: true;
  parentId: string | null;
  webViewLink: string | null;
  rootId?: string | null;
  createdBy?: string | null;
  driveModifiedAt: string | null;
  _count?: { children: number };
};

export async function postExplorerFolder(
  name: string,
  parentFolderId: string
): Promise<
  | { ok: true; file: ExplorerFolderCreated }
  | { ok: false; error: string; status: number }
> {
  const res = await fetch("/api/drive/folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentFolderId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    file?: ExplorerFolderCreated;
  };
  if (!res.ok || !body.file) {
    return {
      ok: false,
      error: body.error || "폴더 생성 실패",
      status: res.status,
    };
  }
  return { ok: true, file: body.file };
}
