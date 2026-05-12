import { Readable } from "stream";
import CloudConvert from "cloudconvert";
import prisma from "@/lib/prisma";
import { getDriveV3 } from "@/lib/google-drive-admin";

const MAX_HWP_BYTES = 40 * 1024 * 1024;

export async function runHwpToPdfConversionJob(sourceDriveFileId: string): Promise<void> {
  const apiKey = process.env.CLOUDCONVERT_API_KEY?.trim();
  const folderId = process.env.GDRIVE_PREVIEW_CACHE_FOLDER_ID?.trim();

  const fail = async (msg: string) => {
    await prisma.filePreviewCache.updateMany({
      where: { driveFileId: sourceDriveFileId, conversionStatus: "PENDING" },
      data: { conversionStatus: "FAILED", conversionError: msg.slice(0, 2000) },
    });
  };

  if (!apiKey) {
    await fail("CLOUDCONVERT_API_KEY 미설정");
    return;
  }
  if (!folderId) {
    await fail("GDRIVE_PREVIEW_CACHE_FOLDER_ID 미설정");
    return;
  }

  const cache = await prisma.filePreviewCache.findUnique({ where: { driveFileId: sourceDriveFileId } });
  if (!cache || cache.conversionStatus !== "PENDING") return;

  const drive = getDriveV3();
  let buf: Buffer;
  try {
    const res = await drive.files.get(
      { fileId: sourceDriveFileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    buf = Buffer.from(res.data as ArrayBuffer);
  } catch (e) {
    await fail(e instanceof Error ? e.message : "Drive 다운로드 실패");
    return;
  }

  if (buf.length > MAX_HWP_BYTES) {
    await fail("파일이 40MB를 초과해 변환할 수 없습니다.");
    return;
  }

  const ext = cache.originalName.split(".").pop()?.toLowerCase() ?? "hwp";
  const uploadName = ext === "hwpx" ? "document.hwpx" : "document.hwp";

  const cc = new CloudConvert(apiKey);
  let job = await cc.jobs.create({
    tasks: {
      "import-hwp": { operation: "import/upload" },
      "convert-pdf": {
        operation: "convert",
        input: "import-hwp",
        output_format: "pdf",
      },
      "export-pdf": { operation: "export/url", input: "convert-pdf" },
    },
  });

  const uploadTask = job.tasks?.find((t) => t.name === "import-hwp");
  if (!uploadTask) {
    await fail("CloudConvert 업로드 태스크 생성 실패");
    return;
  }

  try {
    await cc.tasks.upload(uploadTask, Readable.from(buf), uploadName, buf.length);
  } catch (e) {
    await fail(e instanceof Error ? e.message : "CloudConvert 업로드 실패");
    return;
  }

  try {
    job = await cc.jobs.wait(job.id!);
  } catch (e) {
    await fail(e instanceof Error ? e.message : "CloudConvert 변환 실패");
    return;
  }

  const exportUrls = cc.jobs.getExportUrls(job);
  const file = exportUrls[0];
  if (!file?.url) {
    await fail("변환 결과 URL 없음");
    return;
  }

  let pdfBuf: Buffer;
  try {
    const pdfRes = await fetch(file.url);
    if (!pdfRes.ok) {
      await fail(`PDF 다운로드 HTTP ${pdfRes.status}`);
      return;
    }
    pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  } catch (e) {
    await fail(e instanceof Error ? e.message : "PDF 다운로드 실패");
    return;
  }

  try {
    const created = await drive.files.create({
      requestBody: {
        name: `[미리보기 PDF] ${cache.originalName.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 120)}`,
        parents: [folderId],
      },
      media: { mimeType: "application/pdf", body: Readable.from(pdfBuf) },
      supportsAllDrives: true,
      fields: "id",
    });
    const newId = created.data.id;
    if (!newId) {
      await fail("Drive PDF 업로드 후 id 없음");
      return;
    }

    await prisma.filePreviewCache.update({
      where: { driveFileId: sourceDriveFileId },
      data: {
        conversionStatus: "DONE",
        convertedDriveId: newId,
        convertedAt: new Date(),
        conversionError: null,
      },
    });
  } catch (e) {
    await fail(e instanceof Error ? e.message : "Drive PDF 업로드 실패");
  }
}
