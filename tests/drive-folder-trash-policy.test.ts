import { describe, expect, it } from "vitest";
import {
  canManageExplorerFolderTrash,
  canRenameExplorerItem,
  canTrashExplorerFile,
  sanitizeExplorerRenameName,
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

describe("canRenameExplorerItem", () => {
  it("blocks TEAM_LEAD rename of synced (null createdBy) files", () => {
    expect(
      canRenameExplorerItem({
        role: "TEAM_LEAD",
        actorId: "u1",
        createdBy: null,
        isFolder: false,
      })
    ).toBe(false);
    expect(
      canRenameExplorerItem({
        role: "ADMIN",
        actorId: "a1",
        createdBy: null,
        isFolder: false,
      })
    ).toBe(true);
  });

  it("allows USER rename of own files only", () => {
    expect(
      canRenameExplorerItem({
        role: "USER",
        actorId: "u1",
        createdBy: "u1",
        isFolder: false,
      })
    ).toBe(true);
    expect(
      canRenameExplorerItem({
        role: "USER",
        actorId: "u1",
        createdBy: "u2",
        isFolder: false,
      })
    ).toBe(false);
  });
});

describe("sanitizeExplorerRenameName", () => {
  it("trims and strips path chars", () => {
    expect(sanitizeExplorerRenameName("  a/b\\c  ")).toEqual({
      ok: true,
      name: "abc",
    });
    expect(sanitizeExplorerRenameName("   ").ok).toBe(false);
    expect(sanitizeExplorerRenameName("").ok).toBe(false);
  });
});
