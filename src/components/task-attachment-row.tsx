"use client";

import { useState } from "react";
import { Download, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { Button } from "@/components/ui/button";
import { workspaceFetchHeaders } from "@/lib/workspace-fetch-headers";
import {
  taskAttachmentDownloadHref,
  taskAttachmentDownloadOpensExternalTab,
} from "@/lib/task-attachment-links";

export type TaskAttachmentRowItem = {
  id: string;
  url: string;
  name: string | null;
};

export function TaskAttachmentRow({
  taskId,
  attachment,
  onRemoved,
}: {
  taskId: string;
  attachment: TaskAttachmentRowItem;
  onRemoved: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const a = attachment;
  const href = taskAttachmentDownloadHref(a.url, a.name);
  const external = taskAttachmentDownloadOpensExternalTab(a.url);
  const label = external ? "Drive에서 열기" : "다운로드";

  const handleDelete = async () => {
    if (!confirm("이 첨부를 삭제할까요?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/attachments/${a.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: workspaceFetchHeaders(),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "삭제 실패");
      }
      toast.success("첨부가 삭제되었습니다.");
      onRemoved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card pr-1">
      <div className="min-w-0 flex-1">
        <FilePreviewDialog
          url={a.url}
          name={a.name}
          triggerVariant="ghost"
          triggerClassName="w-full justify-start rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
        />
      </div>
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
      >
        {external ? <ExternalLink className="size-3 shrink-0" /> : <Download className="size-3 shrink-0" />}
        {label}
      </a>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
        disabled={deleting}
        onClick={() => void handleDelete()}
        aria-label="첨부 삭제"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
