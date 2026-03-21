import fs from "fs";
import path from "path";
import type { StoreFileInput, StoreFileResult } from "./types";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "content");

export async function storeLocalFs(input: StoreFileInput): Promise<StoreFileResult> {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  const filepath = path.join(UPLOAD_DIR, input.filename);
  fs.writeFileSync(filepath, input.buffer);
  return {
    url: `/uploads/content/${input.filename}`,
    name: input.originalName,
    provider: "local",
  };
}
