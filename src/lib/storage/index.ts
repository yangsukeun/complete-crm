import type { StorageProviderId, StoreFileInput, StoreFileResult } from "./types";
import { storeVercelBlob } from "./vercel-blob-storage";
import { storeLocalFs } from "./local-fs-storage";
import { storeGoogleDrive } from "./google-drive-storage";
import { mirrorToWebdav, storeWebdav } from "./webdav-storage";

export type { StorageProviderId, StoreFileInput, StoreFileResult };

/**
 * Vercel 등 요청 본문 한도 대비: 이 크기(바이트) 초과 시 Google Drive 업로드 우선(auto 모드).
 */
export const LARGE_FILE_DRIVE_THRESHOLD_BYTES = 4 * 1024 * 1024;

/**
 * STORAGE_PROVIDER
 * - auto (기본):
 *   - 파일이 LARGE_FILE_DRIVE_THRESHOLD_BYTES 초과이고 Drive 설정 가능 → google-drive
 *   - 그 외: WebDAV → Blob → Drive(폴백) 등 환경별 순서
 * - vercel-blob | blob | local | google-drive | drive | webdav | nas (명시 시 크기 무관)
 *
 * @param fileSizeBytes 업로드 시 바이트 길이 전달 권장
 */
export function resolveStorageProvider(fileSizeBytes?: number): StorageProviderId {
  const raw = process.env.STORAGE_PROVIDER?.trim().toLowerCase();
  if (raw && raw !== "auto") {
    if (raw === "google-drive" || raw === "drive") return "google-drive";
    if (raw === "webdav" || raw === "nas") return "webdav";
    if (raw === "vercel-blob" || raw === "blob") return "vercel-blob";
    if (raw === "local") return "local";
  }

  const large =
    typeof fileSizeBytes === "number" && fileSizeBytes > LARGE_FILE_DRIVE_THRESHOLD_BYTES;

  if (large && canUseGoogleDrive()) {
    return "google-drive";
  }

  if (canUseGoogleDrive()) {
    if (process.env.VERCEL) {
      if (canUseWebdav()) return "webdav";
      if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return "vercel-blob";
      return "google-drive";
    }
    if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return "vercel-blob";
    if (canUseWebdav()) return "webdav";
    if (!process.env.VERCEL) return "local";
    return "google-drive";
  }

  if (process.env.VERCEL) {
    if (canUseWebdav()) return "webdav";
    if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return "vercel-blob";
    return "vercel-blob";
  }
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return "vercel-blob";
  }
  return "local";
}

function canUseGoogleDrive(): boolean {
  try {
    return Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() && hasGoogleCredentials());
  } catch {
    return false;
  }
}

function hasGoogleCredentials(): boolean {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) return true;
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() && process.env.GOOGLE_PRIVATE_KEY?.trim()
  );
}

function canUseWebdav(): boolean {
  return Boolean(
    process.env.WEBDAV_URL?.trim() &&
      process.env.WEBDAV_USER?.trim() &&
      process.env.WEBDAV_PUBLIC_BASE_URL?.trim()
  );
}

const mirrorWebdavEnabled = () =>
  process.env.STORAGE_MIRROR_WEBDAV?.trim() === "1" ||
  process.env.STORAGE_MIRROR_WEBDAV?.trim()?.toLowerCase() === "true";

export async function storeUploadedFile(input: StoreFileInput): Promise<StoreFileResult> {
  const provider = resolveStorageProvider(input.buffer.byteLength);

  if (provider === "local" && process.env.VERCEL) {
    throw new Error("STORAGE_PROVIDER=local은 Vercel(읽기 전용 디스크)에서 사용할 수 없습니다.");
  }

  let result: StoreFileResult;
  switch (provider) {
    case "vercel-blob":
      result = await storeVercelBlob(input);
      break;
    case "google-drive":
      try {
        result = await storeGoogleDrive(input);
      } catch (e) {
        console.error("[storage] Google Drive 업로드 실패, 폴백:", e);
        if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
          result = await storeVercelBlob(input);
        } else if (canUseWebdav()) {
          result = await storeWebdav(input);
        } else if (!process.env.VERCEL) {
          result = await storeLocalFs(input);
        } else {
          throw e instanceof Error ? e : new Error(String(e));
        }
      }
      break;
    case "webdav":
      result = await storeWebdav(input);
      break;
    case "local":
      result = await storeLocalFs(input);
      break;
    default: {
      const _never: never = provider;
      throw new Error(`알 수 없는 STORAGE_PROVIDER: ${_never}`);
    }
  }

  if (mirrorWebdavEnabled() && result.provider !== "webdav" && canUseWebdavMirror()) {
    const ok = await mirrorToWebdav(input);
    if (!ok) {
      return { ...result, mirrorWarning: "NAS(WebDAV) 복제에 실패했습니다. 서버 로그를 확인하세요." };
    }
  }

  return result;
}

/** 미러는 PUBLIC_BASE 없이도 업로드만 되면 됨 */
function canUseWebdavMirror(): boolean {
  return Boolean(process.env.WEBDAV_URL?.trim() && process.env.WEBDAV_USER?.trim());
}
