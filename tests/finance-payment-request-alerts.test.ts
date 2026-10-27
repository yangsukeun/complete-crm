vi.mock("@/lib/notifications",()=>({createNotificationWithOptions:vi.fn()}));
import { describe, expect, it, vi } from "vitest";
import { parseTransferExecutorIds } from "@/lib/finance-payment-request-alerts";

describe("finance-payment-request-alerts", () => {
  it("parses transfer executor ids from JSON", () => {
    expect(parseTransferExecutorIds('["u1","u2"]')).toEqual(["u1", "u2"]);
    expect(parseTransferExecutorIds(null)).toEqual([]);
    expect(parseTransferExecutorIds("")).toEqual([]);
    expect(parseTransferExecutorIds("not-json")).toEqual([]);
    expect(parseTransferExecutorIds('["", "u1"]')).toEqual(["u1"]);
  });
});
