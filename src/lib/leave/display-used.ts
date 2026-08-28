/** 화면 사용일 = 올해 부여+유효이월 − 잔여 (표시와 잔여가 같은 식이 되게) */
export function leaveDisplayUsedDays(displayGranted: number, remaining: number): number {
  const n = displayGranted - remaining;
  if (!Number.isFinite(n) || n <= 1e-9) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * 이월(작년 잔여)이 이미 있으면 CRM 전 사용분(manualDeduction)을
 * 올해 풀에 다시 FIFO 하지 않는다. 이월이 그 사용 후 남은 일수이기 때문.
 */
export function shouldFifoPriorUsageOntoCurrentPool(opts: {
  manualDeduction: number;
  annualCarryOver: number;
}): boolean {
  if (opts.manualDeduction <= 1e-6) return false;
  if (opts.annualCarryOver > 1e-6) return false;
  return true;
}
