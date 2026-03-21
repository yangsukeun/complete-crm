export type StorageProviderId = "vercel-blob" | "local" | "google-drive" | "webdav";

export type StoreFileInput = {
  buffer: Buffer;
  filename: string;
  mime: string;
  originalName: string;
};

export type StoreFileResult = {
  url: string;
  name: string;
  provider: StorageProviderId;
  /** NAS(WebDAV) 미러 실패 시에만 */
  mirrorWarning?: string;
};
