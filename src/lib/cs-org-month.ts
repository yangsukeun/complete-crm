import { eachKstYmdInclusive, todayYmdKst } from "@/lib/date-kst";

export type CsClientPhase = "ACTIVE" | "INCOMING" | "OUTGOING";

export function isCsClientPhase(value: unknown): value is CsClientPhase {
  return value === "ACTIVE" || value === "INCOMING" || value === "OUTGOING";
}

export function csClientPhaseLabel(phase: string): string {
  if (phase === "INCOMING") return "들어올 업체";
  if (phase === "OUTGOING") return "나갈 업체";
  return "현재";
}

export function parseYearMonth(ym: string | null | undefined): string {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) return ym;
  return todayYmdKst().slice(0, 7);
}

export function kstMonthRange(ym: string): { start: string; end: string } {
  const start = `${ym}-01`;
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y ?? 2026, m ?? 1, 0)).getUTCDate();
  return { start, end: `${ym}-${String(last).padStart(2, "0")}` };
}

export function shiftYearMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type MonthBrandSpan = {
  from: string;
  until: string;
  days: number;
  ongoing: boolean;
};

/** 담당 기간이 그 달과 겹치면, 그 달 안에서 며칠부터 며칠까지인지 */
export function clipPeriodToMonth(opts: {
  startedOn: string;
  endedOn: string | null;
  ym: string;
  today?: string;
}): MonthBrandSpan | null {
  const { start, end } = kstMonthRange(opts.ym);
  if (opts.startedOn > end) return null;
  if (opts.endedOn && opts.endedOn < start) return null;
  const from = opts.startedOn > start ? opts.startedOn : start;
  const today = opts.today ?? todayYmdKst();
  const open = !opts.endedOn;
  let until = opts.endedOn && opts.endedOn < end ? opts.endedOn : end;
  let ongoing = false;
  if (open) {
    if (opts.ym === today.slice(0, 7)) {
      until = today < until ? today : until;
      ongoing = true;
    }
  }
  if (from > until) return null;
  return { from, until, days: eachKstYmdInclusive(from, until).length, ongoing };
}
