import { compare } from "bcryptjs";

/** Authentication is read-only. Unknown legacy formats require verified recovery,
 * never replacement with an unverified login attempt (even if strings match).
 */
export async function verifyLoginPassword(input: string, stored: string | null | undefined) {
  if (!input || !stored || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(stored)) return false;
  try { return await compare(input, stored); }
  catch { return false; }
}
