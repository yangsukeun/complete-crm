import { describe, expect, it } from "vitest";
import { inferUploadMimeType, validateUploadFile } from "@/lib/upload-policy";
import { googleOfficeEditorUrl, resolveDriveOpenUrl, officeMimeToRepair } from "@/lib/drive/google-office-open";

describe("inferUploadMimeType", () => {
  it("replaces Hangul Office MIME on .docx so Google treats it as Word", () => {
    expect(inferUploadMimeType("인턴_기업상담내용정리.docx", "application/haansoftdocx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  it("replaces empty/octet-stream with Office MIME from extension", () => {
    expect(inferUploadMimeType("a.xlsx", "")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(inferUploadMimeType("a.pptx", "application/octet-stream")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
  });

  it("keeps real .hwp as Hangul, not Word", () => {
    expect(inferUploadMimeType("회의록.hwp", "application/haansofthwp")).toBe("application/x-hwp");
  });

  it("does not rewrite native Google Workspace MIME", () => {
    expect(inferUploadMimeType("제목 없는 문서", "application/vnd.google-apps.document")).toBe(
      "application/vnd.google-apps.document"
    );
  });
});

describe("validateUploadFile", () => {
  it("does not reject files over 1GB", () => {
    const file = { name: "big.mp4", size: 6 * 1024 * 1024 * 1024 } as File;
    expect(validateUploadFile(file).ok).toBe(true);
  });
});

describe("googleOfficeEditorUrl", () => {
  it("opens haansoft-tagged docx in Docs with sd=true", () => {
    expect(
      googleOfficeEditorUrl("1abc", "인턴_기업상담내용정리.docx", "application/haansoftdocx")
    ).toBe("https://docs.google.com/document/d/1abc/edit?usp=drivesdk&sd=true");
    expect(officeMimeToRepair("인턴_기업상담내용정리.docx", "application/haansoftdocx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  it("leaves native Google Docs on stored webViewLink", () => {
    expect(
      resolveDriveOpenUrl({
        driveFileId: "1abc",
        fileName: "제목 없는 문서",
        mimeType: "application/vnd.google-apps.document",
        webViewLink: "https://docs.google.com/document/d/1abc/edit",
      })
    ).toBe("https://docs.google.com/document/d/1abc/edit");
  });
});
