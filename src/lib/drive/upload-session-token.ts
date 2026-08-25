import { createHmac, timingSafeEqual } from "crypto";

export type ExplorerUploadSessionPayload = {
  v: 1;
  uid: string;
  /** Google resumable session URL */
  gUrl: string;
  parentDbId: string;
  parentDriveId: string;
  rootId: string;
  name: string;
  mime: string;
  size: number;
  exp: number;
};

function secret(): string {
  const s =
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.UPLOAD_SESSION_SECRET?.trim();
  if (!s) throw new Error("NEXTAUTH_SECRET(또는 UPLOAD_SESSION_SECRET)이 필요합니다.");
  return s;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function signExplorerUploadSession(
  payload: ExplorerUploadSessionPayload
): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyExplorerUploadSession(
  token: string
):
  | { ok: true; payload: ExplorerUploadSessionPayload }
  | { ok: false; error: string } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, error: "세션 토큰이 올바르지 않습니다." };
  const [body, sig] = parts;
  if (!body || !sig) return { ok: false, error: "세션 토큰이 올바르지 않습니다." };
  const expect = b64url(createHmac("sha256", secret()).update(body).digest());
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: "세션 토큰 서명이 올바르지 않습니다." };
    }
  } catch {
    return { ok: false, error: "세션 토큰 서명이 올바르지 않습니다." };
  }
  let payload: ExplorerUploadSessionPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8")) as ExplorerUploadSessionPayload;
  } catch {
    return { ok: false, error: "세션 토큰을 해석할 수 없습니다." };
  }
  if (payload?.v !== 1 || !payload.gUrl || !payload.uid) {
    return { ok: false, error: "세션 토큰 형식이 올바르지 않습니다." };
  }
  if (Date.now() > payload.exp) {
    return { ok: false, error: "업로드 세션이 만료되었습니다. 다시 시도하세요." };
  }
  return { ok: true, payload };
}
