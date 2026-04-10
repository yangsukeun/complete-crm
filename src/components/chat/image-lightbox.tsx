"use client";

import { useEffect, useState } from "react";
import { Download, X, ZoomIn, ZoomOut } from "lucide-react";

export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute right-4 top-4 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(s + 0.5, 3))}
          className="rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
          aria-label="확대"
        >
          <ZoomIn className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setScale((s) => Math.max(s - 0.5, 0.5))}
          className="rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
          aria-label="축소"
        >
          <ZoomOut className="size-5" />
        </button>
        <a
          href={src}
          download
          className="rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
          onClick={(e) => e.stopPropagation()}
          aria-label="다운로드"
        >
          <Download className="size-5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/20 p-2 text-white hover:bg-white/40"
          aria-label="닫기"
        >
          <X className="size-5" />
        </button>
      </div>

      <img
        src={src}
        alt={alt || "이미지"}
        style={{ transform: `scale(${scale})` }}
        className="max-h-[90vh] max-w-[90vw] select-none object-contain transition-transform"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
    </div>
  );
}

