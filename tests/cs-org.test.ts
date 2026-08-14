import { describe, expect, it } from "vitest";
import { csOrgBand, pickCsBirthdaysThisMonth } from "@/lib/cs-org";

describe("csOrgBand", () => {
  it("orders 부팀장 before 팀장 substring", () => {
    expect(csOrgBand("센터장")).toBe("chief");
    expect(csOrgBand("부팀장")).toBe("lead");
    expect(csOrgBand("팀장")).toBe("lead");
    expect(csOrgBand("CS")).toBe("staff");
  });
});

describe("pickCsBirthdaysThisMonth", () => {
  it("hides year and counts missing", () => {
    const asOf = new Date("2026-08-13T00:00:00+09:00");
    const { birthdays, missingCount } = pickCsBirthdaysThisMonth(
      [
        { id: "1", name: "A", birthDate: new Date("1990-08-20T00:00:00+09:00") },
        { id: "2", name: "B", birthDate: new Date("1991-01-01T00:00:00+09:00") },
        { id: "3", name: "C", birthDate: null },
      ],
      asOf
    );
    expect(missingCount).toBe(1);
    expect(birthdays).toEqual([{ id: "1", name: "A", monthDay: "8/20", isToday: false }]);
    expect(birthdays[0]?.monthDay).not.toMatch(/1990/);
  });

  it("marks today's birthday first", () => {
    const asOf = new Date("2026-08-14T00:00:00+09:00");
    const { birthdays } = pickCsBirthdaysThisMonth(
      [
        { id: "1", name: "Later", birthDate: new Date("1990-08-20T00:00:00+09:00") },
        { id: "2", name: "Today", birthDate: new Date("1991-08-14T00:00:00+09:00") },
      ],
      asOf
    );
    expect(birthdays[0]).toMatchObject({ name: "Today", isToday: true, monthDay: "8/14" });
    expect(birthdays[1]?.isToday).toBe(false);
  });
});
