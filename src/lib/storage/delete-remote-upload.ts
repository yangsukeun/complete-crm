import fs from "fs";
import path from "path";
import { del } from "@vercel/blob";
import { deleteFile, parseGoogleDriveFileIdFromUrl } from "@/lib/storage/google-drive-storage";
import { deleteWebdavFileByPublicUrl, webdavPublicUrlToRelPath } from "@/lib/storage/webdav-storage";

/**
 * 업로드된 파일 URL 기준 원격(또는 로컬 public) 삭제 — 실패해도 throw하지 않음 (로그만).
 */
export async function tryDeleteRemoteFileByUrl(url: string): Promise<void> {
  const u = (url ?? "").trim();
  if (!u) return;

  try {
    const fid = parseGoogleDriveFileIdFromUrl(u);
    if (fid) {
      await deleteFile(fid);
      return;
    }
  } catch (e) {
    console.error("[storage] tryDeleteRemoteFileByUrl (Drive):", e);
  }

  try {
    if (webdavPublicUrlToRelPath(u)) {
      await deleteWebdavFileByPublicUrl(u);
      return;
    }
  } catch (e) {
    console.error("[storage] tryDeleteRemoteFileByUrl (WebDAV):", e);
  }

  try {
    if (u.includes(".public.blob.vercel-storage.com")) {
      const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
      if (token) await del(u.split("?")[0] ?? u, { token });
      return;
    }
  } catch (e) {
    console.error("[storage] tryDeleteRemoteFileByUrl (Blob):", e);
  }

  try {
    if (u.startsWith("/uploads/content/") && !process.env.VERCEL) {
      const base = path.basename(u.replace(/^\/uploads\/content\//, ""));
      if (!base || base.includes("..")) return;
      const fp = path.join(process.cwd(), "public", "uploads", "content", base);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  } catch (e) {
    console.error("[storage] tryDeleteRemoteFileByUrl (local):", e);
  }
}
