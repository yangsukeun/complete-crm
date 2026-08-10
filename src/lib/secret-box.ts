import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * 외부 서비스 자격증명(네이버 앱 비밀번호 등) 저장용 AES-256-GCM 봉투.
 * 형식: v1:<iv-base64>:<tag-base64>:<cipher-base64>
 */

const PREFIX = "v1";
const SALT = "complete-crm.secret-box.v1";

function secretKey(): Buffer {
  const raw =
    process.env.CALENDAR_CREDENTIAL_KEY ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;
  if (!raw?.trim()) {
    throw new Error(
      "자격증명 암호화 키가 없습니다. CALENDAR_CREDENTIAL_KEY 또는 AUTH_SECRET을 설정하세요."
    );
  }
  return scryptSync(raw.trim(), SALT, 32);
}

export function secretBoxConfigured(): boolean {
  try {
    secretKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(
    ":"
  );
}

export function decryptSecret(envelope: string): string {
  const parts = envelope.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("암호문 형식이 올바르지 않습니다.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
