import "server-only";

/**
 * 시놀로지 NAS File Station 설정.
 * GOOGLE_DRIVE_* / WEBDAV_* 와 절대 혼용하지 않음.
 * 값은 환경변수만 — 코드에 하드코딩 금지.
 */
export type NasConfig = {
  quickConnectUrl: string;
  /** API 호출 base (선택 오버라이드). 없으면 QuickConnect URL 사용 */
  apiBaseUrl: string;
  user: string;
  password: string;
  /** 문서 공유 최상위 경로 (예: /문서공유). 급여 폴더는 여기 포함되지 않아야 함 */
  documentsSharePath: string;
};

export type NasConfigError =
  | { ok: false; code: "NOT_CONFIGURED"; message: string }
  | { ok: true; config: NasConfig };

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function normalizeSharePath(path: string): string {
  let p = path.trim().replace(/\\/g, "/");
  if (!p.startsWith("/")) p = `/${p}`;
  // trailing slash 제거 (루트 "/" 제외)
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p;
}

export function getNasConfig(): NasConfigError {
  const quickConnectUrl = process.env.NAS_QUICKCONNECT_URL?.trim() || "";
  const user = process.env.NAS_SERVICE_ACCOUNT_USER?.trim() || "";
  const password = process.env.NAS_SERVICE_ACCOUNT_PASSWORD?.trim() || "";
  const documentsSharePath = process.env.NAS_DOCUMENTS_SHARE_PATH?.trim() || "";
  /** QuickConnect 릴레이가 서버리스에서 실패할 때만 사용 (선택) */
  const apiOverride = process.env.NAS_API_BASE_URL?.trim() || "";

  const missing: string[] = [];
  if (!quickConnectUrl) missing.push("NAS_QUICKCONNECT_URL");
  if (!user) missing.push("NAS_SERVICE_ACCOUNT_USER");
  if (!password) missing.push("NAS_SERVICE_ACCOUNT_PASSWORD");
  if (!documentsSharePath) missing.push("NAS_DOCUMENTS_SHARE_PATH");

  if (missing.length > 0) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: `NAS 문서함이 아직 설정되지 않았습니다. (${missing.join(", ")})`,
    };
  }

  return {
    ok: true,
    config: {
      quickConnectUrl: trimSlash(quickConnectUrl),
      apiBaseUrl: trimSlash(apiOverride || quickConnectUrl),
      user,
      password,
      documentsSharePath: normalizeSharePath(documentsSharePath),
    },
  };
}

export function isNasConfigured(): boolean {
  return getNasConfig().ok;
}

/**
 * 경로가 문서 공유 루트 하위인지 검증 (경로 탈출 방지).
 */
export function assertUnderDocumentsRoot(
  requestedPath: string,
  documentsSharePath: string
): { ok: true; path: string } | { ok: false; message: string } {
  const root = normalizeSharePath(documentsSharePath);
  let path = normalizeSharePath(requestedPath || root);
  // 중복 슬래시 정리
  path = path.replace(/\/+/g, "/");

  if (path !== root && !path.startsWith(`${root}/`)) {
    return { ok: false, message: "허용되지 않은 경로입니다." };
  }
  if (path.includes("..")) {
    return { ok: false, message: "허용되지 않은 경로입니다." };
  }
  return { ok: true, path };
}

/** 브라우저에서 NAS 웹 UI로 열 링크 (로그인 후 열람) */
export function buildNasOpenUrl(quickConnectUrl: string, folderPath: string): string {
  const base = trimSlash(quickConnectUrl);
  // DSM File Station 딥링크 — 로그인 필요 시 로그인 화면으로 유도
  const encoded = folderPath
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `${base}/#file_browser/${encoded}`;
}
