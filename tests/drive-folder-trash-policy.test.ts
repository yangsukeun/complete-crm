import { describe, expect, it } from "vitest";
import {
  canManageExplorerFolderTrash,
  canTrashExplorerFile,
} from "@/lib/drive/folder-trash-policy";

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

describe("canTrashExplorerFile", () => {
  it("allows TEAM_LEAD+ regardless of createdBy", () => {
    expect(
      canTrashExplorerFile({ role: "TEAM_LEAD", actorId: "u1", createdBy: null })
    ).toBe(true);
    expect(
      canTrashExplorerFile({ role: "ADMIN", actorId: "a1", createdBy: "other" })
    ).toBe(true);
  });

  it("allows USER only for own uploads", () => {
    expect(
      canTrashExplorerFile({ role: "USER", actorId: "u1", createdBy: "u1" })
    ).toBe(true);
    expect(
      canTrashExplorerFile({ role: "USER", actorId: "u1", createdBy: "u2" })
    ).toBe(false);
    expect(
      canTrashExplorerFile({ role: "USER", actorId: "u1", createdBy: null })
    ).toBe(false);
  });
});
