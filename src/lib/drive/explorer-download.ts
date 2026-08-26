import { Readable } from "stream";
import { getDriveV3 } from "@/lib/google-drive-admin";

const GOOGLE_APPS_EXPORT: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: ".docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: ".xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ext: ".pptx",
  },
  "application/vnd.google-apps.drawing": {
    mime: "application/pdf",
    ext: ".pdf",
  },
};

export function sanitizeDownloadName(name: string): string {
  const n = name.replace(/[/\\?%*:|"<>]/g, "_").trim().slice(0, 200);
  return n.length > 0 ? n : "download";
}

function ensureExt(name: string, ext: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(ext.toLowerCase())) return name;
  return `${name}${ext}`;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export type ExplorerDownloadPayload = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

/**
 * Google Drive 파일 바이너리(또는 Workspace export)를 버퍼로 가져온다.
 */
export async function fetchExplorerFileDownload(
  driveFileId: string,
  opts?: { nameHint?: string | null; mimeHint?: string | null }
): Promise<ExplorerDownloadPayload> {
  const drive = getDriveV3();
  const meta = await drive.files.get({
    fileId: driveFileId,
    fields: "id,name,mimeType,size",
    supportsAllDrives: true,
  });
  const mime = String(meta.data.mimeType ?? opts?.mimeHint ?? "application/octet-stream");
  const baseName = sanitizeDownloadName(
    String(meta.data.name ?? opts?.nameHint ?? "download")
  );

  if (mime === "application/vnd.google-apps.folder") {
    throw new Error("FOLDER_NOT_DOWNLOADABLE");
  }

  const exportSpec = GOOGLE_APPS_EXPORT[mime];
  if (exportSpec) {
    const exportRes = await drive.files.export(
      { fileId: driveFileId, mimeType: exportSpec.mime },
      { responseType: "arraybuffer" }
    );
    const data = exportRes.data as ArrayBuffer;
    return {
      fileName: ensureExt(baseName, exportSpec.ext),
      mimeType: exportSpec.mime,
      buffer: Buffer.from(data),
    };
  }

  if (mime.startsWith("application/vnd.google-apps.")) {
    throw new Error("UNSUPPORTED_GOOGLE_FILE");
  }

  const mediaRes: unknown = await drive.files.get(
    { fileId: driveFileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );
  const nodeStream = (mediaRes as { data?: NodeJS.ReadableStream }).data;
  if (!nodeStream || typeof (nodeStream as Readable).pipe !== "function") {
    throw new Error("STREAM_FAILED");
  }
  const buffer = await streamToBuffer(nodeStream);
  return {
    fileName: baseName,
    mimeType: mime || "application/octet-stream",
    buffer,
  };
}

export function attachmentDownloadHeaders(
  fileName: string,
  mimeType?: string
): Record<string, string> {
  const enc = encodeURIComponent(fileName);
  return {
    "Content-Type": mimeType || "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${enc}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-cache",
  };
}
