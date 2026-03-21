import { Readable } from "stream";
import { google } from "googleapis";
import type { StoreFileInput, StoreFileResult } from "./types";

function getServiceAccountCreds(): { client_email: string; private_key: string } {
  const jsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonRaw) {
    const parsed = JSON.parse(jsonRaw) as { client_email?: string; private_key?: string };
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

export async function storeGoogleDrive(input: StoreFileInput): Promise<StoreFileResult> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID(업로드 대상 폴더 ID)를 설정하세요. 폴더는 서비스 계정에 공유되어 있어야 합니다.");
  }

  const { client_email, private_key } = getServiceAccountCreds();
  const auth = new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  const drive = google.drive({ version: "v3", auth });

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
  });

  const fileId = res.data.id;
  if (!fileId) {
    throw new Error("Drive 업로드 후 file id를 받지 못했습니다.");
  }

  const anyoneReader =
    process.env.GOOGLE_DRIVE_ANYONE_READER?.trim() === "1" ||
    process.env.GOOGLE_DRIVE_ANYONE_READER?.trim()?.toLowerCase() === "true";
  if (anyoneReader) {
    try {
      await drive.permissions.create({
        fileId,
        requestBody: { role: "reader", type: "anyone" },
      });
    } catch (e) {
      console.error("[storage] GOOGLE_DRIVE_ANYONE_READER permission 실패:", e);
    }
  }

  const url = `https://drive.google.com/file/d/${fileId}/view`;
  return { url, name: input.originalName, provider: "google-drive" };
}
