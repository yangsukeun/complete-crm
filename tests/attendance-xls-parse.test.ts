import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseAttendanceBuffer, parsePunchTimesFromCell } from "@/lib/attendance-xls-parse";

const JUNE_NAMES = [
  "김정우",
  "노혜림",
  "결근자",
  "김소윤",
  "테스트05",
  "테스트06",
  "테스트07",
  "테스트08",
  "테스트09",
  "테스트10",
  "테스트11",
  "테스트12",
  "테스트13",
  "테스트14",
  "테스트15",
  "테스트16",
  "테스트17",
  "테스트18",
  "테스트19",
  "테스트20",
  "테스트21",
  "테스트22",
  "테스트23",
  "테스트24",
  "테스트25",
  "테스트26",
  "테스트27",
  "테스트28",
  "테스트29",
  "테스트30",
  "테스트31",
  "테스트32",
];

function buildJune2026Workbook(): Buffer {
  const data: unknown[][] = [["출퇴근 기록", "", "기간", "2026/06/01 ~ 06/30"]];
  JUNE_NAMES.forEach((name, idx) => {
    const machineNo = String(idx + 1);
    data.push(["", ...Array.from({ length: 30 }, (_, d) => d + 1)]);
    data.push(["사원번호", machineNo, "성명", name]);
    const punches: unknown[] = [""];
    if (name === "김정우") {
      punches.push("08:54\n17:59");
      for (let d = 2; d <= 30; d++) punches.push("");
    } else if (name === "노혜림") {
      punches.push("19:23");
      for (let d = 2; d <= 30; d++) punches.push("");
    } else {
      for (let d = 1; d <= 30; d++) punches.push("");
    }
    data.push(punches);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "근태기록");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parsePunchTimesFromCell", () => {
  it("splits newline punches and keeps a single stamp", () => {
    expect(parsePunchTimesFromCell("08:54\n17:59")).toEqual(["08:54", "17:59"]);
    expect(parsePunchTimesFromCell("19:23")).toEqual(["19:23"]);
    expect(parsePunchTimesFromCell("")).toEqual([]);
  });

  it("reads excel time serials", () => {
    const eightFiftyFour = (8 * 60 + 54) / (24 * 60);
    expect(parsePunchTimesFromCell(eightFiftyFour)).toEqual(["08:54"]);
  });
});

describe("parseAttendanceBuffer", () => {
  it("parses 32 employees, 김정우 6/1, 노혜림 incomplete, 결근 무에러", () => {
    const parsed = parseAttendanceBuffer(buildJune2026Workbook());
    expect(parsed.year).toBe(2026);
    expect(parsed.month).toBe(6);
    expect(parsed.employees).toHaveLength(32);

    const jungwoo = parsed.punches.find((p) => p.name === "김정우" && p.date === "2026-06-01");
    expect(jungwoo?.clockIn).toBe("2026-06-01T08:54:00+09:00");
    expect(jungwoo?.clockOut).toBe("2026-06-01T17:59:00+09:00");
    expect(jungwoo?.incomplete).toBe(false);

    const hyerim = parsed.punches.find((p) => p.name === "노혜림" && p.date === "2026-06-01");
    expect(hyerim?.clockIn).toBe("2026-06-01T19:23:00+09:00");
    expect(hyerim?.clockOut).toBeNull();
    expect(hyerim?.incomplete).toBe(true);

    expect(parsed.employees.some((e) => e.name === "결근자")).toBe(true);
    expect(parsed.punches.some((p) => p.name === "결근자")).toBe(false);
  });

  it("re-parsing the same file yields the same punch keys (upsert 대상)", () => {
    const buf = buildJune2026Workbook();
    const a = parseAttendanceBuffer(buf);
    const b = parseAttendanceBuffer(buf);
    const key = (p: { machineNo: string; date: string }) => `${p.machineNo}|${p.date}`;
    expect(a.punches.map(key).sort()).toEqual(b.punches.map(key).sort());
    expect(new Set(a.punches.map(key)).size).toBe(a.punches.length);
  });
});
