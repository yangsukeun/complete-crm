import { describe, expect, it } from "vitest";
import { canManageExplorerFolderTrash } from "@/lib/drive/folder-trash-policy";

describe("canManageExplorerFolderTrash", () => {
  it("allows ADMIN/EXECUTIVE always", () => {
    expect(
      canManageExplorerFolderTrash({
        role: "ADMIN",
        actorId: "a1",
        createdBy: null,
      })
    ).toBe(true);
    expect(
      canManageExplorerFolderTrash({
        role: "EXECUTIVE",
        actorId: "a1",
        createdBy: "other",
      })
    ).toBe(true);
  });

  it("allows creator only for non-admin", () => {
    expect(
      canManageExplorerFolderTrash({
        role: "TEAM_LEAD",
        actorId: "u1",
        createdBy: "u1",
      })
    ).toBe(true);
    expect(
      canManageExplorerFolderTrash({
        role: "TEAM_LEAD",
        actorId: "u1",
        createdBy: "u2",
      })
    ).toBe(false);
    expect(
      canManageExplorerFolderTrash({
        role: "USER",
        actorId: "u1",
        createdBy: null,
      })
    ).toBe(false);
  });
});
