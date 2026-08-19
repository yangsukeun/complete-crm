export type CsOrgMemoSlots = { a: string; b: string; c: string };

export const CS_ORG_MEMO_LABELS = ["메모 1", "메모 2", "메모 3"] as const;

export function parseCsOrgMemoSlots(content: string | null | undefined): CsOrgMemoSlots {
  const raw = String(content ?? "").trim();
  if (!raw) return { a: "", b: "", c: "" };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>;
      if ("a" in o || "b" in o || "c" in o) {
        return {
          a: typeof o.a === "string" ? o.a : "",
          b: typeof o.b === "string" ? o.b : "",
          c: typeof o.c === "string" ? o.c : "",
        };
      }
    }
  } catch {
    /* plain text */
  }
  return { a: String(content ?? ""), b: "", c: "" };
}

export function stringifyCsOrgMemoSlots(slots: CsOrgMemoSlots): string {
  return JSON.stringify({
    a: slots.a,
    b: slots.b,
    c: slots.c,
  });
}
