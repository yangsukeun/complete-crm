import { z } from "zod";
import { safeParseAttachments } from "@/lib/board-attachments";

export const userNoteCategorySchema = z.enum(["COMPANY", "TRAINING", "FREE", "ANONYMOUS"]);

export const userNoteAttachmentsFieldSchema = z.preprocess(
  (v) => {
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x) => ({
        url: typeof x.url === "string" ? x.url.trim() : "",
        name: typeof x.name === "string" ? x.name : undefined,
      }))
      .filter((x) => x.url.length > 0);
  },
  z
    .array(
      z.object({
        url: z.string().min(1),
        name: z.string().optional(),
      })
    )
    .max(20)
);

/** PATCH/POST body의 첨부 배열 → DB JSON 문자열 */
export function userNoteAttachmentsToDbJson(raw: unknown): string {
  const parsed = userNoteAttachmentsFieldSchema.safeParse(raw);
  if (!parsed.success) return "[]";
  return JSON.stringify(
    parsed.data.map((a) => ({
      url: a.url,
      name: (a.name && a.name.trim()) || "링크",
    }))
  );
}

export function mapNoteWithParsedAttachments<
  T extends { attachments: string },
>(row: T): Omit<T, "attachments"> & { attachments: ReturnType<typeof safeParseAttachments> } {
  return {
    ...row,
    attachments: safeParseAttachments(row.attachments),
  };
}
