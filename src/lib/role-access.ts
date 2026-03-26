/** 대표/시스템 관리자 — 공지·직원 역할·공지 삭제 등 */
export function isExecutiveOrAdmin(role: string | null | undefined): boolean {
  const r = String(role ?? "").toUpperCase();
  return r === "EXECUTIVE" || r === "ADMIN";
}

export function canPostAnnouncement(role: string | null | undefined): boolean {
  return isExecutiveOrAdmin(role);
}
