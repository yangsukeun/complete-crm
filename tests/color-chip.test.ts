import { describe, expect, it } from "vitest";
import { csToolCategoryTone } from "@/lib/cs-tools";
import { attendanceStatusChipTone, leaveStatusChipTone } from "@/lib/color-chip";

describe("csToolCategoryTone", () => {
  it("maps hub categories to chip tones", () => {
    expect(csToolCategoryTone("관리·보고")).toBe("blue");
    expect(csToolCategoryTone("매뉴얼")).toBe("green");
    expect(csToolCategoryTone("통계·분석")).toBe("purple");
    expect(csToolCategoryTone("AI 답변생성")).toBe("yellow");
    expect(csToolCategoryTone("교육")).toBe("yellow");
    expect(csToolCategoryTone("커뮤니티")).toBe("pink");
    expect(csToolCategoryTone("기타")).toBe("gray");
    expect(csToolCategoryTone("없는카테고리")).toBe("gray");
  });
});

describe("status chip tones", () => {
  it("uses token tones for attendance", () => {
    expect(attendanceStatusChipTone("IN")).toBe("green");
    expect(attendanceStatusChipTone("AWAY")).toBe("yellow");
    expect(attendanceStatusChipTone("OUT")).toBe("blue");
    expect(attendanceStatusChipTone("ABSENT")).toBe("red");
  });

  it("uses token tones for leave", () => {
    expect(leaveStatusChipTone("APPROVED")).toBe("green");
    expect(leaveStatusChipTone("REJECTED")).toBe("red");
    expect(leaveStatusChipTone("CANCELLED")).toBe("gray");
    expect(leaveStatusChipTone("PENDING")).toBe("yellow");
  });
});
