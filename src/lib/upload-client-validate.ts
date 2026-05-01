/**
 * 클라이언트 업로드 검증 — 서버 /api/upload 정책(차단 확장자·용량)과 동기화
 */

import { validateUploadFile } from "@/lib/upload-policy";

export { UPLOAD_MAX_BYTES, validateUploadFile } from "@/lib/upload-policy";

export const UPLOAD_TOAST_DURATION_MS = 5000;

export type PostUploadFileOptions = {
  /** XMLHttpRequest upload progress (브라우저에서만 동작) */
  onUploadProgress?: (loaded: number, total: number) => void;
};

export const UPLOAD_ERROR_MESSAGE = {
  blocked: "실행 파일은 보안상 업로드할 수 없습니다. 압축 파일(.zip)로 보내주세요.",
  size: "파일 크기는 1GB 이하여야 합니다.",
  dailyQuota: "일일 업로드 한도(5GB)를 초과했습니다. 내일 다시 시도해 주세요.",
  payloadTooLarge:
    "파일이 너무 큽니다. Google Drive에 자동 저장을 시도합니다. 여전히 실패하면 네트워크·플랫폼 한도를 확인하거나 잠시 후 다시 시도해 주세요.",
  server: "업로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
} as const;

export type PerFileUploadAttemptResult =
  | { status: "skipped"; file: File; reason: string }
  | { status: "success"; file: File; url: string; name?: string }
  | { status: "failed"; file: File; reason: string };

export async function getUploadErrorMessageFromResponse(res: Response): Promise<string> {
  let raw = "";
  try {
    const data = (await res.json()) as { error?: string };
    raw = typeof data.error === "string" ? data.error : "";
  } catch {
    raw = "";
  }
  if (res.status === 413) {
    return UPLOAD_ERROR_MESSAGE.payloadTooLarge;
  }
  if (res.status === 429) {
    if (/5GB|1GB|일일|한도/i.test(raw)) return UPLOAD_ERROR_MESSAGE.dailyQuota;
    return raw || UPLOAD_ERROR_MESSAGE.dailyQuota;
  }
  if (res.status === 400) {
    if (/1GB|1\s*GB|100MB|100\s*MB|이하|초과/i.test(raw)) return UPLOAD_ERROR_MESSAGE.size;
    if (/실행 파일|압축 파일/i.test(raw)) return UPLOAD_ERROR_MESSAGE.blocked;
    return raw || UPLOAD_ERROR_MESSAGE.server;
  }
  if (res.status >= 500 || !res.ok) return UPLOAD_ERROR_MESSAGE.server;
  return raw || UPLOAD_ERROR_MESSAGE.server;
}

function parseUploadJsonResponse(xhr: XMLHttpRequest): { url?: string; name?: string; error?: string } {
  try {
    const text = xhr.responseText || "";
    return JSON.parse(text) as { url?: string; name?: string; error?: string };
  } catch {
    return {};
  }
}

/** 브라우저: 진행률 콜백 가능. 그 외: fetch 폴백 */
function postUploadFileWithXhr(
  file: File,
  onUploadProgress?: (loaded: number, total: number) => void
): Promise<{ url: string; name?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.withCredentials = true;
    xhr.timeout = 0;
    xhr.upload.onprogress = (ev) => {
      if (onUploadProgress && ev.lengthComputable) {
        onUploadProgress(ev.loaded, ev.total);
      }
    };
    xhr.onload = () => {
      void (async () => {
        try {
          const data = parseUploadJsonResponse(xhr);
          if (xhr.status >= 200 && xhr.status < 300) {
            const url = typeof data.url === "string" ? data.url.trim() : "";
            if (!url) {
              reject(new Error(UPLOAD_ERROR_MESSAGE.server));
              return;
            }
            resolve({ url, name: data.name });
            return;
          }
          const res = new Response(xhr.responseText, {
            status: xhr.status,
            headers: { "content-type": xhr.getResponseHeader("content-type") || "application/json" },
          });
          reject(new Error(await getUploadErrorMessageFromResponse(res)));
        } catch (e) {
          reject(e instanceof Error ? e : new Error(UPLOAD_ERROR_MESSAGE.server));
        }
      })();
    };
    xhr.onerror = () => reject(new Error(UPLOAD_ERROR_MESSAGE.server));
    xhr.onabort = () => reject(new Error(UPLOAD_ERROR_MESSAGE.server));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

/** 검증 후 /api/upload POST — 실패 시 Error(message) 던짐 */
export async function postUploadFile(
  file: File,
  options?: PostUploadFileOptions
): Promise<{ url: string; name?: string }> {
  const v = validateUploadFile(file);
  if (!v.ok) {
    throw new Error(v.error);
  }
  const useXhr =
    typeof XMLHttpRequest !== "undefined" &&
    typeof window !== "undefined" &&
    (Boolean(options?.onUploadProgress) || file.size >= 8 * 1024 * 1024);

  if (useXhr) {
    return postUploadFileWithXhr(file, options?.onUploadProgress);
  }

  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData, credentials: "include" });
  if (!res.ok) {
    throw new Error(await getUploadErrorMessageFromResponse(res));
  }
  const data = (await res.json()) as { url?: string; name?: string };
  const url = typeof data.url === "string" ? data.url.trim() : "";
  if (!url) throw new Error(UPLOAD_ERROR_MESSAGE.server);
  return { url, name: data.name };
}

/**
 * 여러 파일을 순차 업로드. 파일마다 try/catch — 일부 실패해도 나머지 진행.
 * `onProgress`: 1-based 파일 번호, 전체 파일 수, 선택적 현재 파일 바이트 진행률
 */
export async function uploadEachFileSequentially(
  files: FileList | File[],
  opts?: {
    onProgress?: (current: number, total: number, partLoaded?: number, partTotal?: number) => void;
  }
): Promise<PerFileUploadAttemptResult[]> {
  const list = Array.from(files);
  const total = list.length;
  const results: PerFileUploadAttemptResult[] = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    opts?.onProgress?.(i + 1, total, 0, file.size);
    if (!file.size) {
      results.push({ status: "skipped", file, reason: "빈 파일" });
      continue;
    }
    const v = validateUploadFile(file);
    if (!v.ok) {
      results.push({ status: "failed", file, reason: v.error });
      continue;
    }
    try {
      const data = await postUploadFile(file, {
        onUploadProgress: (loaded, tot) => opts?.onProgress?.(i + 1, total, loaded, tot),
      });
      results.push({ status: "success", file, url: data.url, name: data.name });
    } catch (err) {
      const reason = err instanceof Error ? err.message : UPLOAD_ERROR_MESSAGE.server;
      results.push({ status: "failed", file, reason });
    }
  }
  return results;
}

/** 대량 업로드 후 토스트 문구용 요약 */
export function summarizeSequentialUploadResults(results: PerFileUploadAttemptResult[]) {
  return {
    ok: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
  };
}
