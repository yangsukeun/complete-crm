import { createClient } from "webdav";
import type { StoreFileInput, StoreFileResult } from "./types";

function webdavClient() {
  const baseUrl = process.env.WEBDAV_URL?.trim();
  const user = process.env.WEBDAV_USER?.trim();
  const pass = process.env.WEBDAV_PASSWORD ?? "";
  if (!baseUrl || !user) {
    throw new Error("NAS(WebDAV): WEBDAV_URL, WEBDAV_USER, WEBDAV_PASSWORD를 설정하세요.");
  }
  return createClient(baseUrl, { username: user, password: pass });
}

function remotePath(filename: string): string {
  const sub = (process.env.WEBDAV_SUBPATH || "crm-uploads/board-content").replace(/^\/+|\/+$/g, "");
  return `${sub}/${filename}`;
}

/** 공개 URL이 없으면 업로드는 되지만 브라우저 링크용 url 생성 불가 → 에러 */
export function assertWebdavPublicBase(): string {
  const base = process.env.WEBDAV_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "WEBDAV_PUBLIC_BASE_URL이 필요합니다. (예: QuickConnect/리버스프록시로 열린 HTTPS 경로, 끝에 슬래시 없이)"
    );
  }
  return base;
}

/** 공개 URL → WebDAV 상대 경로 (NAS 공개 링크와 PUT 경로 규칙 동일) */
export function webdavPublicUrlToRelPath(publicUrl: string): string | null {
  const base = process.env.WEBDAV_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) return null;
  const t = publicUrl.trim().split("?")[0]?.split("#")[0] ?? "";
  if (!t.startsWith(base)) return null;
  const pathPart = t.slice(base.length).replace(/^\//, "");
  if (!pathPart) return null;
  return pathPart.split("/").map((seg) => decodeURIComponent(seg)).join("/");
}

export async function deleteWebdavFileByPublicUrl(publicUrl: string): Promise<void> {
  const rel = webdavPublicUrlToRelPath(publicUrl);
  if (!rel) return;
  const client = webdavClient();
  await client.deleteFile(rel);
}

export async function getWebdavBufferByPublicUrl(publicUrl: string): Promise<Buffer | null> {
  const rel = webdavPublicUrlToRelPath(publicUrl);
  if (!rel) return null;
  const client = webdavClient();
  const raw = await client.getFileContents(rel, { format: "binary" });
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof ArrayBuffer) return Buffer.from(raw);
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (typeof raw === "string") return Buffer.from(raw, "binary");
  if (raw && typeof raw === "object" && "data" in raw) {
    const d = (raw as { data: unknown }).data;
    if (Buffer.isBuffer(d)) return d;
    if (d instanceof Uint8Array) return Buffer.from(d);
  }
  return null;
}

export async function storeWebdav(input: StoreFileInput): Promise<StoreFileResult> {
  const client = webdavClient();
  const rel = remotePath(input.filename);
  const parts = rel.split("/");
  const dirs = parts.slice(0, -1).join("/");
  if (dirs) {
    await client.createDirectory(dirs, { recursive: true });
  }
  await client.putFileContents(rel, input.buffer, {
    overwrite: true,
    headers: input.mime ? { "Content-Type": input.mime } : undefined,
  });

  const base = assertWebdavPublicBase();
  const urlPath = parts.map(encodeURIComponent).join("/");
  return {
    url: `${base}/${urlPath}`,
    name: input.originalName,
    provider: "webdav",
  };
}

/** 주 저장소와 별도로 NAS에만 복제 (실패해도 throw하지 않음 — 호출부에서 로그) */
export async function mirrorToWebdav(input: StoreFileInput): Promise<boolean> {
  try {
    const client = webdavClient();
    const rel = remotePath(input.filename);
    const parts = rel.split("/");
    const dirs = parts.slice(0, -1).join("/");
    if (dirs) {
      await client.createDirectory(dirs, { recursive: true });
    }
    await client.putFileContents(rel, input.buffer, {
      overwrite: true,
      headers: input.mime ? { "Content-Type": input.mime } : undefined,
    });
    return true;
  } catch (e) {
    console.error("[storage] NAS(WebDAV) 미러 실패:", e);
    return false;
  }
}
