"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import { Download, Eye, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseGoogleDriveFileIdFromUrl } from "@/lib/google-drive-url-utils";
import { isUnoptimizedRemoteImageSrc } from "@/lib/remote-image-unoptimized";
import type { AttachmentPreviewContext } from "@/lib/files/preview-access";

type PreviewMeta = {
  driveFileId: string;
  originalName: string;
  mimeType: string;
  previewType: string;
  conversionStatus: string;
  conversionError: string | null;
  embedUrl: string | null;
  previewUrl: string | null;
  downloadUrl: string;
};

type Props = {
  url: string;
  name?: string | null;
  context: AttachmentPreviewContext;
  className?: string;
};

function buildMetaUrl(fileId: string, ctx: AttachmentPreviewContext) {
  const p = new URLSearchParams();
  p.set("context", ctx.type);
  if (ctx.type === "board") p.set("postId", ctx.postId);
  else p.set("projectId", ctx.projectId);
  return `/api/files/${encodeURIComponent(fileId)}/preview-meta?${p.toString()}`;
}

async function previewMetaFetcher(url: string): Promise<PreviewMeta> {
  const res = await fetch(url, { credentials: "include" });
  const data = (await res.json()) as PreviewMeta;
  if (res.status === 401 || res.status === 403) throw new Error(String(res.status));
  if (!res.ok && res.status !== 202 && res.status !== 422) throw new Error(`HTTP ${res.status}`);
  return data;
}

export function AttachmentDrivePreview({ url, name, context, className }: Props) {
  const fileId = useMemo(() => parseGoogleDriveFileIdFromUrl(url), [url]);
  const [open, setOpen] = useState(false);
  const title = name || url;

  const swrKey = fileId ? buildMetaUrl(fileId, context) : null;
  const { data, error, mutate } = useSWR<PreviewMeta>(swrKey, previewMetaFetcher, {
    refreshInterval: (d) =>
      d?.previewType === "CONVERTED_PDF" && d.conversionStatus === "PENDING" ? 2500 : 0,
    revalidateOnFocus: true,
  });

  const onOpenPreview = useCallback(() => {
    setOpen(true);
  }, []);

  if (!fileId) {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
        <Button type="button" variant="outline" size="sm" className="h-9" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <FileText className="size-4" />
            <span className="ml-2 truncate">{title}</span>
          </a>
        </Button>
      </div>
    );
  }

  const downloadHref = data?.downloadUrl ?? "#";

  const renderBody = () => {
    if (error || !data) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <p>미리보기 정보를 불러오는 중입니다…</p>
        </div>
      );
    }

    if (data.previewType === "UNSUPPORTED") {
      return (
        <div className="space-y-4 p-4 text-sm">
          <p className="text-muted-foreground">이 형식은 인라인 미리보기를 지원하지 않습니다.</p>
          <Button asChild>
            <a href={downloadHref} target="_blank" rel="noopener noreferrer">
              <Download className="mr-2 size-4" />
              다운로드
            </a>
          </Button>
        </div>
      );
    }

    if (data.previewType === "CONVERTED_PDF") {
      if (data.conversionStatus === "FAILED") {
        return (
          <div className="space-y-4 p-4 text-sm">
            <p className="text-destructive">변환에 실패했습니다. {data.conversionError ?? ""}</p>
            <Button asChild variant="secondary">
              <a href={downloadHref} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 size-4" />
                다운로드
              </a>
            </Button>
          </div>
        );
      }
      if (data.conversionStatus === "PENDING") {
        return (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-10 animate-spin text-primary" />
            <p>한글 파일을 PDF로 변환 중입니다. 보통 5~15초 걸립니다.</p>
          </div>
        );
      }
      if (data.previewUrl) {
        return (
          <iframe
            src={data.previewUrl}
            className="h-[min(80vh,900px)] w-full rounded-md border bg-white"
            title={title}
          />
        );
      }
    }

    if (data.previewType === "DRIVE_EMBED" && data.embedUrl) {
      return (
        <iframe
          src={data.embedUrl}
          className="h-[min(80vh,900px)] w-full rounded-md border bg-white"
          title={title}
        />
      );
    }

    if (data.previewType === "INLINE_NATIVE" && data.previewUrl) {
      const m = data.mimeType.toLowerCase();
      if (m.startsWith("image/")) {
        return (
          <div className="flex justify-center p-4">
            <Image
              src={data.previewUrl}
              alt={title}
              width={1200}
              height={900}
              unoptimized={isUnoptimizedRemoteImageSrc(data.previewUrl)}
              className="max-h-[75vh] w-auto max-w-full object-contain"
            />
          </div>
        );
      }
      if (m.startsWith("video/")) {
        return <video src={data.previewUrl} controls className="max-h-[75vh] w-full bg-black" />;
      }
      return (
        <iframe
          src={data.previewUrl}
          className="h-[min(80vh,900px)] w-full rounded-md border bg-white"
          title={title}
        />
      );
    }

    return (
      <div className="p-4 text-sm text-muted-foreground">
        미리보기를 표시할 수 없습니다.
        <Button className="mt-4" asChild variant="secondary">
          <a href={downloadHref} target="_blank" rel="noopener noreferrer">
            다운로드
          </a>
        </Button>
      </div>
    );
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <Button type="button" variant="default" size="sm" className="h-9" onClick={onOpenPreview}>
        <Eye className="size-4" />
        <span className="ml-1.5">미리보기</span>
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-9" asChild>
        <a
          href={data?.downloadUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!data?.downloadUrl) e.preventDefault();
          }}
        >
          <Download className="size-4" />
          <span className="ml-1.5">다운로드</span>
        </a>
      </Button>
      <span className="max-w-[200px] truncate text-xs text-muted-foreground sm:max-w-xs">{title}</span>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) void mutate();
        }}
      >
        <DialogContent className="flex max-h-[min(92vh,calc(100dvh-1rem))] w-[min(96vw,1100px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1100px)]">
          <DialogHeader className="shrink-0 border-b px-4 py-3">
            <DialogTitle className="truncate pr-8 text-base">{title}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto bg-muted/20">
            {open ? renderBody() : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
