import "server-only";
import {
  assertUnderDocumentsRoot,
  buildNasOpenUrl,
  getNasConfig,
  type NasConfig,
} from "@/lib/nas/config";

/**
 * 시놀로지 File Station API (WebDAV 아님).
 * - 목록 메타데이터만 조회 (바이트 본문 미수신)
 * - sid 인메모리 캐시 (TTL) + 만료(119 등) 시 1회 재로그인
 */

type SynoEnvelope<T = unknown> = {
  success: boolean;
  data?: T;
  error?: { code?: number };
};

export type NasListItem = {
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
  mtime: number | null; // unix sec
  ext: string | null;
  openUrl: string;
};

export type NasListResult = {
  path: string;
  parentPath: string | null;
  rootPath: string;
  files: NasListItem[];
  openUrl: string;
};

export type NasErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH_FAILED"
  | "NETWORK"
  | "QUICKCONNECT"
  | "FORBIDDEN_PATH"
  | "API_ERROR";

export class NasApiError extends Error {
  constructor(
    public readonly code: NasErrorCode,
    message: string,
    public readonly synoCode?: number
  ) {
    super(message);
    this.name = "NasApiError";
  }
}

type SessionCache = {
  sid: string;
  synoToken: string | null;
  apiBaseUrl: string;
  expiresAt: number;
};

/** DSM 세션은 보통 수 시간~하루. 보수적으로 25분 후 재발급 */
const SID_TTL_MS = 25 * 60 * 1000;
let sessionCache: SessionCache | null = null;

function isHtmlBody(text: string): boolean {
  const t = text.trimStart().slice(0, 200).toLowerCase();
  return t.startsWith("<!DOCTYPE") || t.startsWith("<html") || t.includes("<script");
}

async function fetchSynoJson<T>(
  url: string,
  init?: RequestInit
): Promise<SynoEnvelope<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      redirect: "follow",
      // Node/undici: QuickConnect 인증서·리다이렉트
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new NasApiError(
      "NETWORK",
      `NAS에 연결할 수 없습니다. 사내망·QuickConnect·방화벽을 확인하세요. (${msg})`
    );
  }

  const text = await res.text();
  if (!res.ok) {
    throw new NasApiError(
      "NETWORK",
      `NAS HTTP ${res.status}. QuickConnect 릴레이 또는 사내망 이슈일 수 있습니다.`
    );
  }
  if (isHtmlBody(text)) {
    throw new NasApiError(
      "QUICKCONNECT",
      "QuickConnect가 JSON 대신 HTML(연결 중 페이지)을 반환했습니다. Vercel↔NAS 직접 경로(NAS_API_BASE_URL) 설정이 필요할 수 있습니다."
    );
  }

  try {
    return JSON.parse(text) as SynoEnvelope<T>;
  } catch {
    throw new NasApiError("API_ERROR", "NAS 응답을 파싱할 수 없습니다.");
  }
}

function synoErrorMessage(code: number | undefined, fallback: string): string {
  switch (code) {
    case 400:
      return "NAS 인증 실패: 잘못된 계정 또는 비밀번호입니다.";
    case 401:
      return "NAS 계정 비활성 또는 권한 없음.";
    case 402:
      return "NAS 2단계 인증이 필요합니다. 서비스계정 OTP를 비활성화하세요.";
    case 403:
      return "NAS 계정 권한이 없습니다.";
    case 404:
      return "NAS 권한 없음(IP 차단 등).";
    case 406:
      return "NAS OTP 코드 오류.";
    case 407:
      return "NAS 인증 강제 변경 필요.";
    case 408:
      return "NAS 최대 시도 횟수 초과.";
    case 119:
      return "NAS 세션이 만료되었습니다.";
    default:
      return fallback + (code != null ? ` (code ${code})` : "");
  }
}

async function login(config: NasConfig): Promise<SessionCache> {
  const base = config.apiBaseUrl;
  const params = new URLSearchParams({
    api: "SYNO.API.Auth",
    version: "6",
    method: "login",
    account: config.user,
    passwd: config.password,
    session: "FileStation",
    format: "sid",
  });

  // DSM 7: entry.cgi / 구버전: auth.cgi — entry 우선 후 폴백
  const urls = [
    `${base}/webapi/entry.cgi?${params.toString()}`,
    `${base}/webapi/auth.cgi?${params.toString()}`,
  ];

  let lastErr: NasApiError | null = null;
  for (const url of urls) {
    try {
      const body = await fetchSynoJson<{ sid?: string; synotoken?: string }>(url);
      if (!body.success || !body.data?.sid) {
        const code = body.error?.code;
        lastErr = new NasApiError(
          "AUTH_FAILED",
          synoErrorMessage(code, "NAS 로그인에 실패했습니다."),
          code
        );
        continue;
      }
      return {
        sid: body.data.sid,
        synoToken: body.data.synotoken ?? null,
        apiBaseUrl: base,
        expiresAt: Date.now() + SID_TTL_MS,
      };
    } catch (e) {
      if (e instanceof NasApiError) {
        lastErr = e;
        if (e.code === "QUICKCONNECT" || e.code === "NETWORK") throw e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new NasApiError("AUTH_FAILED", "NAS 로그인에 실패했습니다.");
}

async function getSession(config: NasConfig, force = false): Promise<SessionCache> {
  if (
    !force &&
    sessionCache &&
    sessionCache.apiBaseUrl === config.apiBaseUrl &&
    sessionCache.expiresAt > Date.now() + 5_000
  ) {
    return sessionCache;
  }
  sessionCache = await login(config);
  return sessionCache;
}

function invalidateSession() {
  sessionCache = null;
}

type ListFileRaw = {
  isdir?: boolean;
  name?: string;
  path?: string;
  additional?: {
    size?: number;
    time?: { mtime?: number; crtime?: number };
  };
};

async function listOnce(
  config: NasConfig,
  session: SessionCache,
  folderPath: string
): Promise<NasListResult> {
  const params = new URLSearchParams({
    api: "SYNO.FileStation.List",
    version: "2",
    method: "list",
    folder_path: folderPath,
    additional: '["size","time","type"]',
    sort_by: "name",
    sort_direction: "asc",
    _sid: session.sid,
  });
  if (session.synoToken) {
    params.set("SynoToken", session.synoToken);
  }

  const url = `${session.apiBaseUrl}/webapi/entry.cgi?${params.toString()}`;
  const body = await fetchSynoJson<{ files?: ListFileRaw[] }>(url);

  if (!body.success) {
    const code = body.error?.code;
    throw new NasApiError(
      code === 119 ? "AUTH_FAILED" : "API_ERROR",
      synoErrorMessage(code, "파일 목록을 가져오지 못했습니다."),
      code
    );
  }

  const root = config.documentsSharePath;
  const parentPath =
    folderPath === root
      ? null
      : (() => {
          const idx = folderPath.lastIndexOf("/");
          if (idx <= 0) return root;
          const parent = folderPath.slice(0, idx) || root;
          return parent === root || parent.startsWith(`${root}/`) ? parent : root;
        })();

  const files: NasListItem[] = (body.data?.files ?? []).map((f) => {
    const name = f.name ?? "";
    const path = f.path ?? `${folderPath}/${name}`.replace(/\/+/g, "/");
    const isDir = Boolean(f.isdir);
    const size = typeof f.additional?.size === "number" ? f.additional.size : null;
    const mtime =
      typeof f.additional?.time?.mtime === "number" ? f.additional.time.mtime : null;
    const ext = isDir
      ? null
      : name.includes(".")
        ? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
        : null;
    return {
      name,
      path,
      isDir,
      size,
      mtime,
      ext,
      openUrl: buildNasOpenUrl(config.quickConnectUrl, path),
    };
  });

  // 폴더 먼저, 이름순은 API sort에 맡김 — isDir 우선 안정 정렬
  files.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, "ko");
  });

  return {
    path: folderPath,
    parentPath,
    rootPath: root,
    files,
    openUrl: buildNasOpenUrl(config.quickConnectUrl, folderPath),
  };
}

/** 문서 공유 경로 하위 목록 (메타데이터만) */
export async function listNasFiles(requestedPath?: string | null): Promise<NasListResult> {
  const cfg = getNasConfig();
  if (!cfg.ok) {
    throw new NasApiError("NOT_CONFIGURED", cfg.message);
  }
  const { config } = cfg;

  const gate = assertUnderDocumentsRoot(
    requestedPath?.trim() || config.documentsSharePath,
    config.documentsSharePath
  );
  if (!gate.ok) {
    throw new NasApiError("FORBIDDEN_PATH", gate.message);
  }

  let session = await getSession(config);
  try {
    return await listOnce(config, session, gate.path);
  } catch (e) {
    if (e instanceof NasApiError && (e.synoCode === 119 || e.code === "AUTH_FAILED")) {
      invalidateSession();
      session = await getSession(config, true);
      return await listOnce(config, session, gate.path);
    }
    throw e;
  }
}
