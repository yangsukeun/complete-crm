import * as XLSX from "xlsx";

export type ParsedAttendanceEmployee = {
  machineNo: string;
  name: string;
};

export type ParsedAttendancePunch = {
  machineNo: string;
  name: string;
  date: string;
  times: string[];
  raw: string | null;
  clockIn: string | null;
  clockOut: string | null;
  incomplete: boolean;
};

export type ParsedAttendanceWorkbook = {
  year: number;
  month: number;
  periodLabel: string;
  employees: ParsedAttendanceEmployee[];
  punches: ParsedAttendancePunch[];
};

const PERIOD_RE =
  /(\d{4})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[~～]\s*(?:(\d{4})\s*[/.\-]\s*)?(\d{1,2})\s*[/.\-]\s*(\d{1,2})/;

const TIME_RE = /(\d{1,2})\s*[:시]\s*(\d{2})(?:\s*[:분]\s*\d{2})?/;

function cellToPlain(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") return v.replace(/\u00a0/g, " ").trim();
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const h = v.getHours();
    const m = v.getMinutes();
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return String(v).trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function hhmmIso(dateYmd: string, hhmm: string): string {
  return `${dateYmd}T${hhmm}:00+09:00`;
}

function excelFractionToHHmm(n: number): string | null {
  if (!Number.isFinite(n)) return null;
  if (Number.isInteger(n) && n >= 1 && n <= 31) return null;
  const frac = n >= 1 ? n % 1 : n;
  if (frac < 0) return null;
  const totalMinutes = Math.round(frac * 24 * 60);
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function parseHHmmToken(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(TIME_RE);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${pad2(h)}:${pad2(min)}`;
}

/** 타각 셀 → HH:mm 목록 (개행 분리, 엑셀 시간 serial 지원) */
export function parsePunchTimesFromCell(cell: unknown): string[] {
  if (cell == null || cell === "") return [];
  if (typeof cell === "number") {
    const t = excelFractionToHHmm(cell);
    return t ? [t] : [];
  }
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return [`${pad2(cell.getHours())}:${pad2(cell.getMinutes())}`];
  }
  const s = String(cell).replace(/\u00a0/g, " ");
  const parts = s
    .split(/\r\n|\n|\r/)
    .map((p) => p.trim())
    .filter(Boolean);
  const times: string[] = [];
  for (const p of parts) {
    const t = parseHHmmToken(p);
    if (t) times.push(t);
  }
  return times;
}

function excelSerialToDay(serial: number): { year: number; month: number; day: number } | null {
  if (!Number.isFinite(serial) || serial < 20000) return null;
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function cellToDayNumber(cell: unknown, year: number, month: number): number | null {
  if (cell == null || cell === "") return null;
  if (typeof cell === "number") {
    if (Number.isInteger(cell) && cell >= 1 && cell <= 31) return cell;
    const serial = excelSerialToDay(cell);
    if (serial && serial.year === year && serial.month === month) return serial.day;
    return null;
  }
  const s = cellToPlain(cell);
  if (!s) return null;
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    return n >= 1 && n <= 31 ? n : null;
  }
  const mdy = s.match(/^(?:(\d{4})\s*[/.\\-]\s*)?(\d{1,2})\s*[/.\\-]\s*(\d{1,2})$/);
  if (mdy) {
    const y = mdy[1] ? Number(mdy[1]) : year;
    const mo = Number(mdy[2]);
    const d = Number(mdy[3]);
    if (y === year && mo === month && d >= 1 && d <= 31) return d;
    // 6/1 형태가 월/일
    if (!mdy[1] && mo === month && d >= 1 && d <= 31) return d;
  }
  return null;
}

function rowHasEmployeeLabels(row: unknown[]): boolean {
  const joined = row.map(cellToPlain).join(" ");
  return joined.includes("사원번호") || joined.includes("성명");
}

const OTHER_LABELS = /^(사원번호|성명|부서|직책)$/;

function valueAfterLabel(text: string, label: string): string | null {
  const re = new RegExp(`${label}\\s*[:：]?\\s*(\\S+)`);
  const m = text.match(re);
  if (!m?.[1]) return null;
  const v = m[1].trim();
  if (!v || OTHER_LABELS.test(v)) return null;
  return v;
}

function findLabeledValue(row: unknown[], label: string): string | null {
  for (let c = 0; c < row.length; c++) {
    const s = cellToPlain(row[c]);
    if (!s) continue;
    if (s === label || s.replace(/\s+/g, "") === label) {
      for (let k = c + 1; k < row.length && k <= c + 4; k++) {
        const v = cellToPlain(row[k]);
        if (!v) continue;
        if (OTHER_LABELS.test(v)) continue;
        return v;
      }
    }
    const inline = valueAfterLabel(s, label);
    if (inline) return inline;
  }
  return valueAfterLabel(row.map(cellToPlain).join(" "), label);
}

function parseDateRow(row: unknown[], year: number, month: number): Map<number, number> | null {
  if (rowHasEmployeeLabels(row)) return null;
  const map = new Map<number, number>();
  for (let c = 0; c < row.length; c++) {
    const day = cellToDayNumber(row[c], year, month);
    if (day != null) map.set(c, day);
  }
  return map.size >= 5 ? map : null;
}

function findPeriod(rows: unknown[][]): { year: number; month: number; label: string } | null {
  for (const row of rows) {
    for (const cell of row) {
      const s = cellToPlain(cell);
      if (!s) continue;
      const m = s.match(PERIOD_RE);
      if (m) {
        return {
          year: Number(m[1]),
          month: Number(m[2]),
          label: s,
        };
      }
    }
  }
  return null;
}

function findAttendanceSheetName(wb: XLSX.WorkBook): string {
  const names = wb.SheetNames ?? [];
  const exact = names.find((n) => n.trim() === "근태기록");
  if (exact) return exact;
  const fuzzy = names.find((n) => n.includes("근태"));
  if (fuzzy) return fuzzy;
  throw new Error("「근태기록」 시트를 찾을 수 없습니다.");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 출퇴근 기록기 엑셀(근태기록 시트) 파싱.
 * 블록: 날짜번호 행 → 사원번호·성명 행 → 타각 행. 라벨 기준 탐색.
 */
export function parseAttendanceWorkbook(wb: XLSX.WorkBook): ParsedAttendanceWorkbook {
  const sheetName = findAttendanceSheetName(wb);
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error("「근태기록」 시트를 읽을 수 없습니다.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });

  const period = findPeriod(rows);
  if (!period) {
    throw new Error("기간 셀(예: 2026/06/01 ~ 06/30)을 찾을 수 없습니다.");
  }
  const { year, month } = period;
  const maxDay = daysInMonth(year, month);

  let colToDay = new Map<number, number>();
  const employees: ParsedAttendanceEmployee[] = [];
  const punches: ParsedAttendancePunch[] = [];
  const seenMachine = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const dateMap = parseDateRow(row, year, month);
    if (dateMap) {
      colToDay = dateMap;
      continue;
    }

    if (!rowHasEmployeeLabels(row)) continue;

    const machineNo = findLabeledValue(row, "사원번호");
    const name = findLabeledValue(row, "성명");
    if (!machineNo || !name) continue;

    if (!seenMachine.has(machineNo)) {
      seenMachine.add(machineNo);
      employees.push({ machineNo, name });
    }

    const next = rows[i + 1];
    if (!next) continue;
    if (rowHasEmployeeLabels(next) || parseDateRow(next, year, month)) {
      // 타각 행 없음 = 결근. 에러 없이 다음 블록으로.
      continue;
    }

    i += 1;
    if (colToDay.size === 0) continue;

    for (const [col, day] of colToDay) {
      if (day < 1 || day > maxDay) continue;
      const cell = next[col];
      const times = parsePunchTimesFromCell(cell);
      if (times.length === 0) continue;
      const date = ymd(year, month, day);
      const incomplete = times.length === 1;
      const clockIn = hhmmIso(date, times[0]);
      const clockOut = incomplete ? null : hhmmIso(date, times[times.length - 1]);
      const raw = cellToPlain(cell) || times.join("\n");
      punches.push({
        machineNo,
        name,
        date,
        times,
        raw,
        clockIn,
        clockOut,
        incomplete,
      });
    }
  }

  if (employees.length === 0) {
    throw new Error("사원번호·성명 블록을 찾지 못했습니다.");
  }

  return {
    year,
    month,
    periodLabel: period.label,
    employees,
    punches,
  };
}

export function parseAttendanceBuffer(buf: Buffer | Uint8Array): ParsedAttendanceWorkbook {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: true });
  return parseAttendanceWorkbook(wb);
}
