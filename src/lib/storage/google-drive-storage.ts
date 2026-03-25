import { Readable } from "stream";
import { google } from "googleapis";
import type { StoreFileInput, StoreFileResult } from "./types";
import { parseGoogleDriveFileIdFromUrl } from "@/lib/google-drive-url-utils";

export { parseGoogleDriveFileIdFromUrl };

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
 * Drive 파일 ID로 삭제 (공유 드라이브 대응).
 * 실패·자격 증명 없음·잘못된 ID여도 예외를 밖으로 던지지 않음.
 */
export async function deleteFile(fileId: string): Promise<void> {
  const id = fileId?.trim();
  /** Drive ID는 보통 alnum + _- ; 과도하게 막으면 파싱 결과가 버려짐 */
  if (!id || id.length < 5 || /[/\s#?&]/.test(id)) {
    console.log("[storage] deleteFile 스킵(유효하지 않은 fileId)", {
      idPreview: id?.slice(0, 24),
      idLength: id?.length ?? 0,
    });
    return;
  }

  const hasCreds = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
      (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
        process.env.GOOGLE_PRIVATE_KEY?.trim())
  );
  if (!hasCreds) {
    console.warn("[storage] deleteFile 스킵(서비스 계정 env 없음)", {
      fileIdPrefix: id.slice(0, 16),
    });
    return;
  }

  console.log("[storage] deleteFile 시작 → drive.files.delete", {
    fileIdPrefix: id.slice(0, 12) + "…",
    idLength: id.length,
    supportsAllDrives: true,
  });
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
    console.log("[storage] deleteFile 성공 (drive.files.delete 완료)", {
      fileIdPrefix: id.slice(0, 12) + "…",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const gErr =
      e && typeof e === "object" && "response" in e
        ? (e as { response?: { status?: number; statusText?: string; data?: unknown } }).response
        : undefined;
    console.error("[storage] deleteFile 실패 (CRM 흐름은 유지)", {
      fileIdPrefix: id.slice(0, 16),
      message: msg.slice(0, 400),
      httpStatus: gErr?.status,
      httpStatusText: gErr?.statusText,
      apiErrorBody:
        gErr?.data !== undefined ? JSON.stringify(gErr.data).slice(0, 500) : undefined,
    });
  }
}

/** 첨부 URL에서 Drive 파일 ID를 뽑아 `deleteFile` 호출 */
export async function tryDeleteGoogleDriveFileByUrl(url: string): Promise<void> {
  const parsed = parseGoogleDriveFileIdFromUrl(url);
  if (parsed) {
    console.log("[storage] tryDeleteGoogleDriveFileByUrl → deleteFile", {
      fileIdPrefix: parsed.slice(0, 12) + "…",
      urlHost: (() => {
        try {
          return new URL(url.startsWith("//") ? `https:${url}` : url).hostname;
        } catch {
          return "(parse skip)";
        }
      })(),
    });
    await deleteFile(parsed);
  } else {
    console.log("[storage] tryDeleteGoogleDriveFileByUrl: Drive ID 없음 (스킵)", {
      urlPreview: url.slice(0, 80),
    });
  }
}

/**
 * 링크 아는 사용자만 읽기(검색 노출 없음) — 본문 이미지 표시용.
 * 이미 동일 권한이 있으면 API 중복 오류는 무시.
 */
export async function grantDriveAnyoneWithLinkRead(fileId: string): Promise<void> {
  const id = fileId?.trim();
  if (!id || id.length < 5 || /[/\s#?&]/.test(id)) return;

  const skipPublic =
    process.env.GOOGLE_DRIVE_SKIP_PUBLIC_PERMISSION?.trim() === "1" ||
    process.env.GOOGLE_DRIVE_SKIP_PUBLIC_PERMISSION?.trim()?.toLowerCase() === "true";
  if (skipPublic) return;

  const hasCreds = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
      (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
        process.env.GOOGLE_PRIVATE_KEY?.trim())
  );
  if (!hasCreds) return;

  try {
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
    await drive.permissions.create({
      fileId: id,
      requestBody: {
        role: "reader",
        type: "anyone",
        allowFileDiscovery: false,
      },
      supportsAllDrives: true,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already exists|duplicate|File not found|404/i.test(msg)) return;
    console.error("[storage] grantDriveAnyoneWithLinkRead 실패:", msg.slice(0, 240));
  }
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

  await grantDriveAnyoneWithLinkRead(fileId);

  const mime = (input.mime || "").toLowerCase();
  const isImage = mime.startsWith("image/");
  /** 이미지는 thumbnail이 img src에 실제 바이너리를 돌려줌(uc?export=view는 HTML 뷰어로 엑박 가능) */
  const url = isImage
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w2000`
    : `https://drive.google.com/file/d/${fileId}/view`;

  return { url, name: input.originalName, provider: "google-drive" };
}
