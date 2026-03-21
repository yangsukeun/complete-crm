import { put } from "@vercel/blob";
import type { StoreFileInput, StoreFileResult } from "./types";

export async function storeVercelBlob(input: StoreFileInput): Promise<StoreFileResult> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN이 없습니다.");
  }
  const key = `board-content/${input.filename}`;
  const blob = await put(key, input.buffer, {
    access: "public",
    token,
    contentType: input.mime || undefined,
  });
  return { url: blob.url, name: input.originalName, provider: "vercel-blob" };
}
