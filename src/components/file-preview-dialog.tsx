"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ExternalLink, FileText, Image as ImageIcon, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getDriveDownloadUrl, getDriveImageUrl } from "@/lib/google-drive-url";
import { isUnoptimizedRemoteImageSrc } from "@/lib/remote-image-unoptimized";

function getExt(urlOrName: string): string {
  const clean = (urlOrName ?? "").split("?")[0]?.split("#")[0] ?? "";
  const last = clean.split("/").pop() ?? clean;
  const idx = last.lastIndexOf(".");
  if (idx < 0) return "";
  return last.slice(idx + 1).toLowerCase();
}

function toAbsoluteUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("data:")) return url;
  if (typeof window === "undefined") return url;
  return `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
}

function isYouTube(url: string) {
  return /youtube\.com\/watch\?v=|youtu\.be\//i.test(url);
}

function toYouTubeEmbed(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      return `https://www.youtube.com/embed/${id}`;
    }
    const id = u.searchParams.get("v");
    return id ? `https://www.youtube.com/embed/${id}` : url;
  } catch {
    return url;
  }
}

function isOfficeLike(ext: string) {
  return ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv"].includes(ext);
}

type Props = {
  url: string;
  name?: string | null;
  triggerClassName?: string;
  triggerVariant?: "link" | "ghost" | "outline";
};

export function FilePreviewDialog({
  url,
  name,
  triggerClassName,
  triggerVariant = "ghost",
}: Props) {
  const [open, setOpen] = useState(false);
  const title = name || url;

  const { kind, embedUrl, icon } = useMemo(() => {
    const ext = getExt(name || url);
    const abs = toAbsoluteUrl(url);

    if (url.startsWith("data:image/")) {
      return { kind: "image" as const, embedUrl: url, icon: <ImageIcon className="size-4" /> };
    }
    if (isYouTube(abs)) {
      return { kind: "youtube" as const, embedUrl: toYouTubeEmbed(abs), icon: <Film className="size-4" /> };
    }
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) {
      return {
        kind: "image" as const,
        embedUrl: getDriveImageUrl(abs),
        icon: <ImageIcon className="size-4" />,
      };
    }
    if (["mp4", "webm", "ogg", "mov"].includes(ext)) {
      return { kind: "video" as const, embedUrl: abs, icon: <Film className="size-4" /> };
    }
    if (ext === "pdf") {
      return { kind: "pdf" as const, embedUrl: abs, icon: <FileText className="size-4" /> };
    }
    if (isOfficeLike(ext)) {
      // Office Online Viewer (publicly accessible URL required)
      const viewer = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(abs)}`;
      return { kind: "office" as const, embedUrl: viewer, icon: <FileText className="size-4" /> };
    }
    return { kind: "other" as const, embedUrl: abs, icon: <FileText className="size-4" /> };
  }, [name, url]);

  const openHref = useMemo(() => getDriveDownloadUrl(url), [url]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant as any}
          className={triggerClassName}
          onClick={() => setOpen(true)}
        >
          {icon}
          <span className="ml-2 min-w-0 flex-1 truncate">{title}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span className="truncate">{title}</span>
            <a
              href={openHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              새 탭에서 열기 <ExternalLink className="size-4" />
            </a>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto rounded-md border bg-background">
          {kind === "image" && (
            <Image
              src={embedUrl}
              alt={title}
              width={1200}
              height={900}
              unoptimized={
                embedUrl.startsWith("data:") || isUnoptimizedRemoteImageSrc(embedUrl)
              }
              sizes="(max-width: 768px) 100vw, 896px"
              className="max-h-[70vh] w-auto max-w-full mx-auto p-3 object-contain"
            />
          )}
          {kind === "video" && (
            <video src={embedUrl} controls className="w-full max-h-[70vh] bg-black" />
          )}
          {kind === "youtube" && (
            <iframe
              src={embedUrl}
              className="w-full h-[70vh]"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={title}
            />
          )}
          {(kind === "pdf" || kind === "office") && (
            <iframe
              src={embedUrl}
              className="w-full h-[70vh]"
              title={title}
            />
          )}
          {kind === "other" && (
            <div className="p-4 text-sm text-muted-foreground">
              이 파일 형식은 브라우저에서 미리보기가 제한될 수 있습니다.{" "}
              <a href={openHref} target="_blank" rel="noopener noreferrer" className="underline">
                새 탭에서 열기
              </a>
              로 확인해 주세요.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

