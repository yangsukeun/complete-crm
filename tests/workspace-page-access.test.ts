import { describe, expect, it } from "vitest";
import { workspacePageAreas, workspaceHomeHref } from "../src/lib/workspace-page-access";
import { WORKSPACE_OWNER } from "../src/lib/workspace-areas";
import { requireSalesUser } from "../src/lib/logistics-sales";
import { canAccessCsLounge } from "../src/lib/cs-lounge-access";

describe("page navigation is not data authorization", () => {
  it.each(["경영지원", "경영지원팀"])("allows %s home pages without granting sales or CS personal data", department => {
    const user = { id: "synthetic-support", department, accountDisabled: false };
    expect(workspacePageAreas(user)).toEqual(["management", "cs", "logistics"]);
    expect(() => requireSalesUser(user)).toThrow("3PL 접근 권한이 없습니다.");
    expect(canAccessCsLounge({ role: "USER", department })).toBe(false);
  });
  it("does not match names, partial departments or disabled users", () => {
    expect(workspacePageAreas({id:"경영지원",department:"마케팅"})).toEqual(["marketing"]);
    expect(workspacePageAreas({id:"staff",department:"외부경영지원"})).toEqual([]);
    expect(workspacePageAreas({id:WORKSPACE_OWNER,accountDisabled:true})).toEqual([]);
  });
  it("retains CS, logistics and representative scope", () => {
    expect(workspacePageAreas({id:"cs",department:"CS팀"})).toEqual(["cs"]);
    expect(workspacePageAreas({id:"warehouse",department:"물류"})).toEqual(["logistics"]);
    expect(workspacePageAreas({id:WORKSPACE_OWNER})).toHaveLength(4);
    expect(workspaceHomeHref("cs")).toBe("/cs-tools");
    expect(workspaceHomeHref("logistics")).toBe("/logistics");
  });
});
