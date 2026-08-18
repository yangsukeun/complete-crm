import { describe, expect, it } from "vitest";
import { formatKstYmdDot, toKstYmd } from "@/lib/date-kst";
import { leaveRequestDays } from "@/lib/leave/leave-request-days";
import { leaveDisplayDays } from "@/lib/leave-request-serialize";

describe("휴가 날짜 KST 표기", () => {
  it("KST 자정 ISO 를 slice(0,10) 하면 전날이 되지만 toKstYmd 는 달력일을 유지한다", () => {
    const kstMidnight = "2027-08-16T15:00:00.000Z"; // 2027-08-17 00:00 KST
    expect(kstMidnight.slice(0, 10)).toBe("2027-08-16");
    expect(toKstYmd(kstMidnight)).toBe("2027-08-17");
    expect(formatKstYmdDot(kstMidnight)).toBe("2027.08.17");
  });

  it("UTC 자정 휴가(신청 API 저장값)는 slice 와 KST 가 같은 날이다", () => {
    const utcMidnight = "2026-08-18T00:00:00.000Z";
    expect(utcMidnight.slice(0, 10)).toBe("2026-08-18");
    expect(toKstYmd(utcMidnight)).toBe("2026-08-18");
  });

  it("연차 일수는 KST 달력 포함 일수다 (UTC/KST 자정 혼재에도 동일)", () => {
    const utcStart = new Date("2026-08-18T00:00:00.000Z");
    const utcEnd = new Date("2026-08-20T00:00:00.000Z");
    const kstStart = new Date("2026-08-18T00:00:00+09:00");
    const kstEnd = new Date("2026-08-20T00:00:00+09:00");
    expect(leaveRequestDays("ANNUAL", utcStart, utcEnd)).toBe(3);
    expect(leaveRequestDays("ANNUAL", kstStart, kstEnd)).toBe(3);
    expect(leaveDisplayDays("ANNUAL", utcStart, utcEnd)).toBe(3);
    expect(leaveDisplayDays("HALF_AM", utcStart, utcStart)).toBe(0.5);
  });
});
