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
