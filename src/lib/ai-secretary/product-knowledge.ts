import fs from "fs";
import path from "path";

let cached: string | null = null;

export function getProductKnowledge(): string {
  if (process.env.NODE_ENV === "production" && cached !== null) return cached;
  try {
    const filePath = path.join(process.cwd(), "docs", "PRODUCT_KNOWLEDGE.md");
    const content = fs.readFileSync(filePath, "utf-8");
    if (process.env.NODE_ENV === "production") cached = content;
    return content;
  } catch (err) {
    console.error("[product-knowledge] 로드 실패:", err);
    return "";
  }
}
