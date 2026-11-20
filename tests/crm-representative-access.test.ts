import { beforeEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_OWNER } from "../src/lib/workspace-areas";

const { session, findUnique } = vi.hoisted(() => ({ session: vi.fn(), findUnique: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/auth", () => ({ getAppSession: session }));
vi.mock("@/lib/prisma", () => ({ default: { user: { findUnique } } }));

import { requireRepresentative } from "../src/lib/representative-access";

beforeEach(() => vi.resetAllMocks());

describe("server-side owner-only routes", () => {
  it.each([null, { user: { id: "other-user", role: "ADMIN" } }, { user: { id: "other-user", role: "EXECUTIVE" } }])("rejects unauthenticated and other admin accounts", async actor => {
    session.mockResolvedValue(actor);
    await expect(requireRepresentative()).rejects.toThrow("notFound");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each([null, { accountDisabled: true }])("rejects a missing or disabled owner account", async owner => {
    session.mockResolvedValue({ user: { id: WORKSPACE_OWNER } });
    findUnique.mockResolvedValue(owner);
    await expect(requireRepresentative()).rejects.toThrow("notFound");
  });

  it("allows only the active exact representative account", async () => {
    session.mockResolvedValue({ user: { id: WORKSPACE_OWNER } });
    findUnique.mockResolvedValue({ accountDisabled: false });
    await expect(requireRepresentative()).resolves.toBe(WORKSPACE_OWNER);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: WORKSPACE_OWNER }, select: { accountDisabled: true } });
  });
});
