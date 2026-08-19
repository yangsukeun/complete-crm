import { describe, expect, it } from "vitest";
import {
  allowedCsOrgManagers,
  buildCsOrgForest,
  csOrgBand,
  csOrgRank,
  csOrgWouldCycle,
  pickCsBirthdaysThisMonth,
} from "@/lib/cs-org";
import { clipPeriodToMonth, parseYearMonth, shiftYearMonth } from "@/lib/cs-org-month";

describe("csOrgBand", () => {
  it("orders 부팀장 before 팀장 substring", () => {
    expect(csOrgBand("센터장")).toBe("chief");
    expect(csOrgBand("부팀장")).toBe("lead");
    expect(csOrgBand("팀장")).toBe("lead");
    expect(csOrgBand("CS")).toBe("staff");
  });
});

describe("csOrgRank", () => {
  it("keeps 부팀장 separate from 팀장", () => {
    expect(csOrgRank("센터장")).toBe("chief");
    expect(csOrgRank("팀장")).toBe("lead");
    expect(csOrgRank("부팀장")).toBe("deputy");
    expect(csOrgRank("CS")).toBe("staff");
  });
});

describe("buildCsOrgForest", () => {
  const people = [
    { id: "a", name: "김센터", position: "센터장", clients: ["본사"] },
    { id: "b", name: "이팀장", position: "팀장", clients: ["A사"] },
    { id: "c", name: "박부팀", position: "부팀장", clients: [] },
    { id: "d", name: "최사원", position: "사원", clients: ["B사"] },
    { id: "e", name: "정사원", position: "사원", clients: [] },
  ];

  it("puts 센터장 on top and staff under the chosen lead", () => {
    const { roots, unassigned } = buildCsOrgForest(
      people,
      new Map([
        ["d", "c"],
        ["e", "b"],
      ])
    );
    expect(roots).toHaveLength(1);
    expect(roots[0]?.id).toBe("a");
    expect(roots[0]?.children.map((n) => n.id)).toEqual(["b"]);
    expect(roots[0]?.children[0]?.children.map((n) => n.id)).toEqual(["c", "e"]);
    expect(roots[0]?.children[0]?.children.find((n) => n.id === "c")?.children.map((n) => n.id)).toEqual(["d"]);
    expect(unassigned).toEqual([]);
    expect(roots[0]?.clients).toEqual(["본사"]);
  });

  it("keeps staff without a manager in 미소속", () => {
    const { unassigned } = buildCsOrgForest(people, new Map());
    expect(unassigned.map((n) => n.id).sort()).toEqual(["d", "e"]);
  });

  it("ignores staff reporting to staff and treats them as 미소속", () => {
    const { unassigned } = buildCsOrgForest(
      people,
      new Map([
        ["d", "e"],
        ["e", "d"],
      ])
    );
    expect(unassigned.map((n) => n.id).sort()).toEqual(["d", "e"]);
  });

  it("detects a parent-chain cycle", () => {
    const parentOf = new Map<string, string | null>([
      ["a", null],
      ["b", "c"],
      ["c", "b"],
    ]);
    expect(csOrgWouldCycle("b", "c", parentOf)).toBe(true);
    expect(csOrgWouldCycle("a", "b", new Map([["a", "b"], ["b", null]]))).toBe(false);
  });

  it("allows staff under 팀장 or 부팀장 only", () => {
    const staff = people.find((p) => p.id === "d")!;
    expect(allowedCsOrgManagers(staff, people).map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
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

describe("clipPeriodToMonth", () => {
  it("clips an open assignment to days-until-today in the current month", () => {
    const span = clipPeriodToMonth({
      startedOn: "2026-08-03",
      endedOn: null,
      ym: "2026-08",
      today: "2026-08-19",
    });
    expect(span).toMatchObject({ from: "2026-08-03", until: "2026-08-19", ongoing: true, days: 17 });
  });

  it("keeps a finished brand through its end day", () => {
    const span = clipPeriodToMonth({
      startedOn: "2026-07-28",
      endedOn: "2026-08-10",
      ym: "2026-08",
      today: "2026-08-19",
    });
    expect(span).toMatchObject({ from: "2026-08-01", until: "2026-08-10", ongoing: false, days: 10 });
  });

  it("shifts year-month", () => {
    expect(parseYearMonth("2026-08")).toBe("2026-08");
    expect(shiftYearMonth("2026-01", -1)).toBe("2025-12");
  });
});
