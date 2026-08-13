import { describe, expect, it } from "vitest";
import { randomCsLoungeNickname } from "@/lib/cs-lounge-access";

describe("cs lounge nickname", () => {
  it("is two Korean words without latin letters", () => {
    for (let i = 0; i < 30; i++) {
      const nick = randomCsLoungeNickname();
      expect(nick).toMatch(/^[가-힣]+ [가-힣]+$/);
      expect(nick).not.toMatch(/[A-Za-z]/);
    }
  });
});
