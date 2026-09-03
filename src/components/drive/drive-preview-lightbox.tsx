"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  explorerImagePreviewUrl,
  explorerPreviewNeighbors,
  isExplorerImageFile,
} from "@/lib/drive/explorer-preview";
import { cn } from "@/lib/utils";

export type DrivePreviewFile = {
  id: string;
  name: string;
  mimeType: string | null;
  driveFileId: string | null;
  webViewLink: string | null;
};

type Props<T extends DrivePreviewFile> = {
  file: T;
  images: T[];
  openingId: string | null;
  downloadBusy?: boolean;
  onClose: () => void;
  onSelect: (file: T) => void;
  onOpenInGoogle: (file: T) => void;
  onDownload: (file: T) => void;
};

export function DrivePreviewLightbox<T extends DrivePreviewFile>({
  file,
  images,
  openingId,
  downloadBusy,
  onClose,
  onSelect,
  onOpenInGoogle,
  onDownload,
}: Props<T>) {
  const isImage = isExplorerImageFile(file);
  const { index, prev, next } = explorerPreviewNeighbors(images, file.id);
  const canNav = Boolean(prev || next);
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const imageSrc = explorerImagePreviewUrl(file.id);
  const iframeSrc = file.driveFileId
    ? `https://drive.google.com/file/d/${file.driveFileId}/preview`
    : file.webViewLink || "about:blank";

  useEffect(() => {
    setImgFailed(false);
    setImgLoaded(false);
  }, [file.id]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const goPrev = useCallback(() => {
    if (prev) onSelect(prev);
  }, [onSelect, prev]);

  const goNext = useCallback(() => {
    if (next) onSelect(next);
  }, [onSelect, next]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, onClose]);

  useEffect(() => {
    if (!isImage) return;
    for (const neighbor of [prev, next]) {
      if (!neighbor) continue;
      const img = new Image();
      img.src = explorerImagePreviewUrl(neighbor.id);
    }
  }, [isImage, prev, next]);

  const showNativeImage = isImage && !imgFailed;
  const counter =
    index >= 0 && images.length > 0 ? `${index + 1} / ${images.length}` : null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      onTouchStart={(e) => {
        touchStartX.current = e.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? start) - start;
        if (dx > 56) goPrev();
        else if (dx < -56) goNext();
      }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{file.name}</p>
          {counter ? (
            <p className="text-xs text-white/70">{counter}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1 bg-sky-600 text-xs text-white hover:bg-sky-700"
            disabled={openingId === file.id}
            onClick={() => void onOpenInGoogle(file)}
          >
            구글에서 열기
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
            disabled={downloadBusy}
            onClick={() => onDownload(file)}
          >
            <Download className="size-3.5" />
            다운로드
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            <X className="size-3.5" />
            닫기
          </Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-6">
        {canNav && prev ? (
          <button
            type="button"
            className="absolute left-3 top-1/2 z-10 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30"
            aria-label="이전 이미지"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
          >
            <ChevronLeft className="size-7" />
          </button>
        ) : null}
        {canNav && next ? (
          <button
            type="button"
            className="absolute right-3 top-1/2 z-10 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/30"
            aria-label="다음 이미지"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
          >
            <ChevronRight className="size-7" />
          </button>
        ) : null}

        {showNativeImage ? (
          <div
            className="relative flex h-full w-full items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {!imgLoaded ? (
              <Loader2 className="absolute size-10 animate-spin text-white/70" />
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={file.id}
              src={imageSrc}
              alt={file.name}
              draggable={false}
              className={cn(
                "max-h-full max-w-full select-none object-contain",
                imgLoaded ? "opacity-100" : "opacity-0"
              )}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgFailed(true)}
            />
          </div>
        ) : (
          <div
            className="h-full w-full overflow-hidden rounded-lg bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              title={file.name}
              src={iframeSrc}
              className="h-full w-full border-0"
              allow="autoplay"
            />
          </div>
        )}
      </div>
    </div>
  );
}
