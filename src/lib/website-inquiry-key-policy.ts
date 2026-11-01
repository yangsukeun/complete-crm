export const INQUIRY_KEY_MAX_AGE_MS = 90 * 86400000;
export const INQUIRY_KEY_OVERLAP_MS = 24 * 3600000;
export type InquiryKey = { tokenSha256: string; issuedAt: number; expiresAt: number };
export type PreviousInquiryKey = InquiryKey & { acceptUntil: number };
export function validInquiryKey(key: InquiryKey) {
  return /^[a-f0-9]{64}$/.test(key.tokenSha256) && Number.isFinite(key.issuedAt) &&
    Number.isFinite(key.expiresAt) && key.expiresAt > key.issuedAt && key.expiresAt-key.issuedAt <= INQUIRY_KEY_MAX_AGE_MS;
}
export function validPreviousInquiryKey(current: InquiryKey, previous: PreviousInquiryKey) {
  return validInquiryKey(previous) && previous.tokenSha256 !== current.tokenSha256 &&
    previous.issuedAt <= current.issuedAt && Number.isFinite(previous.acceptUntil) &&
    previous.acceptUntil > current.issuedAt && previous.acceptUntil <= current.issuedAt + INQUIRY_KEY_OVERLAP_MS &&
    previous.acceptUntil <= previous.expiresAt && previous.acceptUntil <= current.expiresAt;
}
