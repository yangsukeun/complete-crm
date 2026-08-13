import { describe, expect, it } from "vitest";
import { serializeLoungePost } from "@/lib/cs-lounge-serialize";

describe("serializeLoungePost", () => {
  it("omits authorId and authorName for LOUNGE", () => {
    const json = serializeLoungePost(
      {
        id: "p1",
        type: "LOUNGE",
        content: "hello",
        nickname: "포근한 구름",
        createdAt: new Date("2026-08-13T00:00:00Z"),
        authorId: "secret-user",
        authorName: "한민성",
        votes: [{ userId: "v1", value: "LIKE" }],
      },
      "v1"
    );
    expect(json).not.toHaveProperty("authorId");
    expect(json).not.toHaveProperty("authorName");
    expect(JSON.stringify(json)).not.toContain("secret-user");
    expect(JSON.stringify(json)).not.toContain("한민성");
    expect(json.nickname).toBe("포근한 구름");
    expect(json.likeCount).toBe(1);
    expect(json.myVote).toBe("LIKE");
    expect(json.isMine).toBe(false);
  });

  it("includes authorName for NOTICE", () => {
    const json = serializeLoungePost(
      {
        id: "p2",
        type: "NOTICE",
        content: "notice",
        nickname: null,
        createdAt: new Date("2026-08-13T00:00:00Z"),
        authorId: "lead-1",
        authorName: "이소미",
        votes: [],
      },
      "lead-1"
    );
    expect(json).toMatchObject({ authorName: "이소미", isMine: true, nickname: null });
    expect(json).not.toHaveProperty("authorId");
  });
});
