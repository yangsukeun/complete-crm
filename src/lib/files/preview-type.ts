import type { PreviewType } from "@prisma/client";

export type { PreviewType };

/**
 * Drive 메타(mime) + 파일명으로 미리보기 파이프라인 분류.
 */
export function classifyForPreview(mime: string, filename: string): PreviewType {
  const m = (mime || "").toLowerCase().trim();
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (m === "application/pdf") return "INLINE_NATIVE";
  if (m.startsWith("image/")) return "INLINE_NATIVE";
  if (m.startsWith("video/")) return "INLINE_NATIVE";
  if (m.startsWith("text/")) return "INLINE_NATIVE";
  if (m === "application/json") return "INLINE_NATIVE";
  if (m === "text/csv" || ext === "csv") return "INLINE_NATIVE";
  if (m === "text/markdown" || ext === "md" || ext === "markdown") return "INLINE_NATIVE";

  const driveEmbedExt = ["docx", "doc", "xlsx", "xls", "pptx", "ppt"];
  if (driveEmbedExt.includes(ext)) return "DRIVE_EMBED";
  if (
    m.includes("wordprocessingml") ||
    m.includes("spreadsheetml") ||
    m.includes("presentationml") ||
    m === "application/msword" ||
    m === "application/vnd.ms-excel" ||
    m === "application/vnd.ms-powerpoint"
  ) {
    return "DRIVE_EMBED";
  }

  if (["hwp", "hwpx"].includes(ext)) return "CONVERTED_PDF";
  if (m.includes("haansofthwp") || m.includes("x-hwp")) return "CONVERTED_PDF";

  if (ext === "zip" || m === "application/zip" || m === "application/x-zip-compressed") {
    return "UNSUPPORTED";
  }

  return "UNSUPPORTED";
}
