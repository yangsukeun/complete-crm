import { describe, expect, it } from "vitest";
import { compare } from "bcryptjs";
import { hashPasswordForStore } from "@/lib/employee-password";
import { isPasswordChangeTooShort } from "@/lib/password-policy";

describe("employee password hashing contract", () => {
  it("rejects change shorter than 8 characters", () => {
    expect(isPasswordChangeTooShort("1234567")).toBe(true);
    expect(isPasswordChangeTooShort("12345678")).toBe(false);
  });

  it("single bcrypt cost-10 hash matches login compare", async () => {
    const plain = "CsNewPass!1";
    const hashed = await hashPasswordForStore(plain);
    expect(hashed.ok).toBe(true);
    if (!hashed.ok) return;
    expect(hashed.hashed.startsWith("$2")).toBe(true);
    expect(await compare(plain, hashed.hashed)).toBe(true);
  });

  it("rejects 7-char password at hash helper", async () => {
    const hashed = await hashPasswordForStore("short7!");
    expect(hashed.ok).toBe(false);
  });
});
