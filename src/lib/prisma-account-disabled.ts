/**
 * 배포 후 `prisma migrate deploy` 전에 앱이 올라가면 User.accountDisabled 컬럼이 없어
 * 모든 User 쿼리가 실패할 수 있음 → 로그인·비밀번호 재설정 전부 불가.
 */
export function isPrismaMissingUserAccountDisabledColumn(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? "");
  const meta = (err as { meta?: { column?: string } })?.meta;
  if (meta?.column === "accountDisabled") return true;
  if (msg.includes("accountDisabled") && (msg.includes("does not exist") || msg.includes("Unknown column"))) {
    return true;
  }
  if (msg.includes('column "accountDisabled"') || msg.includes("column `accountDisabled`")) return true;
  return false;
}
