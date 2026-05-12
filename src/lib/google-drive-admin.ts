import { google } from "googleapis";

let _cachedAuth: InstanceType<typeof google.auth.JWT> | null = null;
let _cachedAuthKey = "";

function getServiceAccountCreds(): { client_email: string; private_key: string } {
  const jsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonRaw) {
    let parsed: { client_email?: string; private_key?: string };
    try {
      parsed = JSON.parse(jsonRaw) as { client_email?: string; private_key?: string };
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON이 올바른 JSON이 아닙니다.");
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON에 client_email, private_key가 필요합니다.");
    }
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.trim()?.replace(/\\n/g, "\n");
  if (email && key) {
    return { client_email: email, private_key: key };
  }
  throw new Error(
    "Google Drive: GOOGLE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_SERVICE_ACCOUNT_EMAIL+GOOGLE_PRIVATE_KEY를 설정하세요."
  );
}

/** Drive API v3용 JWT (drive + drive.file). */
export function getOrCreateDriveJwtAuth(): InstanceType<typeof google.auth.JWT> {
  const creds = getServiceAccountCreds();
  const key = creds.client_email + "|" + creds.private_key.slice(-32);
  if (_cachedAuth && _cachedAuthKey === key) return _cachedAuth;
  _cachedAuth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive",
    ],
  });
  _cachedAuthKey = key;
  return _cachedAuth;
}

export function getDriveV3() {
  return google.drive({ version: "v3", auth: getOrCreateDriveJwtAuth() });
}

export function sanitizeDriveFileId(id: string): string | null {
  const t = id.trim();
  if (!t || t.length < 5) return null;
  if (/[/\s#?&]/.test(t)) return null;
  return t;
}
