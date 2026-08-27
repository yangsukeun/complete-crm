import { fileNameExtension, inferUploadMimeType } from "@/lib/upload-policy";

/**
 * MS Office 바이너리를 Google 편집기에서 연다 (sd=true).
 * 한컴 MIME(application/haansoftdocx 등)으로 올라간 .docx 는
 * drive.google.com/file/.../view 가 다운로드로 떨어지므로 여기로 보낸다.
 */
export function googleOfficeEditorUrl(
  driveFileId: string,
  fileName: string,
  mimeType?: string | null
): string | null {
  const declared = (mimeType || "").toLowerCase();
  if (declared.includes("google-apps.")) return null;

  const mime = inferUploadMimeType(fileName, mimeType).toLowerCase();
  const ext = fileNameExtension(fileName);
  const id = encodeURIComponent(driveFileId);

  if (
    ext === "docx" ||
    ext === "doc" ||
    mime.includes("wordprocessingml") ||
    mime === "application/msword"
  ) {
    return `https://docs.google.com/document/d/${id}/edit?usp=drivesdk&sd=true`;
  }
  if (
    ext === "xlsx" ||
    ext === "xls" ||
    mime.includes("spreadsheetml") ||
    mime.includes("ms-excel")
  ) {
    return `https://docs.google.com/spreadsheets/d/${id}/edit?usp=drivesdk&sd=true`;
  }
  if (
    ext === "pptx" ||
    ext === "ppt" ||
    mime.includes("presentationml") ||
    mime.includes("ms-powerpoint")
  ) {
    return `https://docs.google.com/presentation/d/${id}/edit?usp=drivesdk&sd=true`;
  }
  return null;
}

export function resolveDriveOpenUrl(opts: {
  driveFileId: string;
  fileName: string;
  mimeType?: string | null;
  webViewLink?: string | null;
}): string {
  const office = googleOfficeEditorUrl(opts.driveFileId, opts.fileName, opts.mimeType);
  if (office) return office;
  if (opts.webViewLink?.trim()) return opts.webViewLink.trim();
  return `https://drive.google.com/file/d/${opts.driveFileId}/view`;
}

/** Drive에 잘못된 한컴/octet MIME이 남아 있으면 표준 Office MIME으로 고쳐야 함 */
export function officeMimeToRepair(
  fileName: string,
  mimeType?: string | null
): string | null {
  const current = (mimeType || "").toLowerCase();
  if (current.includes("google-apps.")) return null;
  if (!googleOfficeEditorUrl("x", fileName, mimeType)) return null;
  const desired = inferUploadMimeType(fileName, mimeType);
  if (current === desired.toLowerCase()) return null;
  return desired;
}
