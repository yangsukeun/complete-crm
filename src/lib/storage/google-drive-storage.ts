import { Readable } from "stream";
import { google } from "googleapis";
import type { StoreFileInput, StoreFileResult } from "./types";

function getServiceAccountCreds(): { client_email: string; private_key: string } {
  const jsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonRaw) {
    let parsed: { client_email?: string; private_key?: string };
    try {
      parsed = JSON.parse(jsonRaw) as { client_email?: string; private_key?: string };
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON이 올바른 JSON이 아닙니다.");
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON에 client_email, private_key가 필요합니다.");
    }
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.trim()?.replace(/\\n/g, "\n");
  if (email && key) {
    return { client_email: email, private_key: key };
  }
  throw new Error(
    "Google Drive: GOOGLE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_SERVICE_ACCOUNT_EMAIL+GOOGLE_PRIVATE_KEY를 설정하세요."
  );
}

/**
 * DB에 저장된 링크에서 Drive 파일 ID 추출.
 * - https://drive.google.com/file/d/FILE_ID/view?usp=...
 * - //drive.google.com/... (프로토콜 상대)
 * - drive.google.com/... (스킴 없음)
 * - /file/d/ID/... (경로만)
 * - open?id=FILE_ID
 */
export function parseGoogleDriveFileIdFromUrl(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;

  let s = raw;
  if (s.startsWith("//")) s = `https:${s}`;
  else if (!/^https?:\/\//i.test(s) && /drive\.google\.com/i.test(s)) s = `https://${s.replace(/^\/+/, "")}`;

  const pathMatch = /drive\.google\.com\/file\/d\/([^/?#]+)/i.exec(s);
  if (pathMatch) {
    let seg = pathMatch[1].trim();
    try {
      seg = decodeURIComponent(seg);
    } catch {
      /* keep seg */
    }
    if (seg.length < 5) return null;
    return seg;
  }

  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "drive.google.com") return null;
    const id = u.searchParams.get("id");
    if (!id) return null;
    let decoded = id.trim();
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      /* keep decoded */
    }
    if (decoded.length < 5) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Drive 파일 ID로 삭제 (공유 드라이브 대응).
 * 실패·자격 증명 없음·잘못된 ID여도 예외를 밖으로 던지지 않음.
 */
export async function deleteFile(fileId: string): Promise<void> {
  const id = fileId?.trim();
  /** Drive ID는 보통 alnum + _- ; 과도하게 막으면 파싱 결과가 버려짐 */
  if (!id || id.length < 5 || /[/\s#?&]/.test(id)) {
    console.log("[storage] deleteFile 스킵(유효하지 않은 fileId)", { idPreview: id?.slice(0, 24) });
    return;
  }

  const hasCreds = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
      (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
        process.env.GOOGLE_PRIVATE_KEY?.trim())
  );
  if (!hasCreds) {
    console.warn("[storage] deleteFile 스킵(서비스 계정 env 없음)", { fileId: id.slice(0, 16) });
    return;
  }

  console.log("[storage] deleteFile API 호출", { fileId: id.slice(0, 12) + "…" });
  try {
    const { client_email, private_key } = getServiceAccountCreds();
    /** 공유 드라이브·삭제에서 drive.file만으로 403 나는 경우 대비 (서비스 계정 전용) */
    const auth = new google.auth.JWT({
      email: client_email,
      key: private_key,
      scopes: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive",
      ],
    });
    const drive = google.drive({ version: "v3", auth });
    await drive.files.delete({
      fileId: id,
      supportsAllDrives: true,
    });
    console.log("[storage] deleteFile 성공", { fileId: id.slice(0, 12) + "…" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[storage] deleteFile 실패 (CRM 흐름은 유지)", { fileId: id.slice(0, 16), msg: msg.slice(0, 200) });
  }
}

/** 첨부 URL에서 Drive 파일 ID를 뽑아 `deleteFile` 호출 */
export async function tryDeleteGoogleDriveFileByUrl(url: string): Promise<void> {
  const parsed = parseGoogleDriveFileIdFromUrl(url);
  if (parsed) await deleteFile(parsed);
}

export async function storeGoogleDrive(input: StoreFileInput): Promise<StoreFileResult> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID(업로드 대상 폴더 ID)를 설정하세요. 폴더는 서비스 계정에 공유되어 있어야 합니다.");
  }

  const { client_email, private_key } = getServiceAccountCreds();
  const auth = new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive",
    ],
  });
  const drive = google.drive({ version: "v3", auth });

  /** 공유 드라이브(Team Drive) 내 폴더가 부모일 때 필수 — 없으면 404/403으로 업로드 실패 */
  const res = await drive.files.create({
    requestBody: {
      name: input.filename,
      parents: [folderId],
    },
    media: {
      mimeType: input.mime || "application/octet-stream",
      body: Readable.from(input.buffer),
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const fileId = res.data.id;
  if (!fileId) {
    throw new Error("Drive 업로드 후 file id를 받지 못했습니다.");
  }

  /** CRM 본문·미리보기에서 <img>로 바로 쓰려면 "링크가 있는 모든 사용자" 읽기 필요 */
  const skipPublic =
    process.env.GOOGLE_DRIVE_SKIP_PUBLIC_PERMISSION?.trim() === "1" ||
    process.env.GOOGLE_DRIVE_SKIP_PUBLIC_PERMISSION?.trim()?.toLowerCase() === "true";
  if (!skipPublic) {
    try {
      await drive.permissions.create({
        fileId,
        requestBody: { role: "reader", type: "anyone" },
        supportsAllDrives: true,
      });
    } catch (e) {
      console.error("[storage] Drive anyone reader permission 실패 (이미지 열람이 제한될 수 있음):", e);
    }
  }

  const mime = (input.mime || "").toLowerCase();
  const isImage = mime.startsWith("image/");
  /** 페이지 URL(/view)은 img src에 부적합 → 공개 이미지는 직접 표시 URL */
  const url = isImage
    ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`
    : `https://drive.google.com/file/d/${fileId}/view`;

  return { url, name: input.originalName, provider: "google-drive" };
}
