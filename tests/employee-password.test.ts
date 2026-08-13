import { describe, expect, it } from "vitest";
import { compare, hash } from "bcryptjs";

/**
 * 직원 수정 PATCH / updateEmployeePassword 는 hash(pw, 10) 한 번만 저장하고
 * 로그인은 bcryptjs compare 로 비교한다. 이중 해싱이면 compare 가 실패한다.
 */
describe("employee password hashing contract", () => {
  it("single bcrypt cost-10 hash matches login compare", async () => {
    const plain = "CsNewPass!1";
    const hashed = await hash(plain, 10);
    expect(hashed.startsWith("$2")).toBe(true);
    expect(await compare(plain, hashed)).toBe(true);
    expect(await compare(plain, await hash(hashed, 10))).toBe(false);
  });
});
