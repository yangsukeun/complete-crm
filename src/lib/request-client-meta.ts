/** Vercel·리버스 프록시 환경에서 클라이언트 IP (첫 hop) */
export function getClientIpFromRequest(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  return real && real.length > 0 ? real : null;
}

export function getClientUserAgent(req: Request): string | null {
  const ua = req.headers.get("user-agent")?.trim();
  return ua && ua.length > 0 ? ua : null;
}
