/** 팀장·센터장·대표·관리자 — 견적서 삭제 승인·실행 */
export function canApproveQuotationDelete(role: string | null | undefined): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "TEAM_LEAD" || r === "CENTER_CHIEF" || r === "EXECUTIVE" || r === "ADMIN";
}

/** 일반 직원(발행자)만 삭제 요청. 팀장급은 바로 삭제한다. */
export function canRequestQuotationDelete(opts: {
  role: string | null | undefined;
  userId: string;
  issuedById: string | null | undefined;
}): boolean {
  if (canApproveQuotationDelete(opts.role)) return false;
  return Boolean(opts.issuedById && opts.issuedById === opts.userId);
}
