import { getDriveDownloadUrl } from "@/lib/google-drive-url";

/** Drive는 브라우저 직접 다운로드, 그 외는 서버 프록시 */
export function taskAttachmentDownloadHref(url: string, name: string | null | undefined): string {
  if (/drive\.google\.com/i.test(url)) {
    return getDriveDownloadUrl(url);
  }
  const n = (name && name.trim()) || "download";
  return `/api/file-download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(n)}`;
}

export function taskAttachmentDownloadOpensExternalTab(url: string): boolean {
  return /drive\.google\.com/i.test(url);
}
