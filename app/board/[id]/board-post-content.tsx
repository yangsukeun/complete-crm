"use client";

import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { boardDescriptionLooksLikeHtml } from "@/lib/board-body";
import { sanitizeNoteHtml } from "@/lib/sanitize-note-html";
import { FileText, GraduationCap, Building2, MessageSquare, Ghost } from "lucide-react";

const CATEGORY_LABEL: Record<string, string> = {
  COMPANY: "회사 자료",
  TRAINING: "교육자료",
  FREE: "자유게시판",
  ANONYMOUS: "익명게시판",
};

export function BoardPostContent({
  description,
  contentType = "text",
  attachments,
  category,
}: {
  description: string;
  contentType?: string;
  attachments: { url: string; name: string }[];
  category: string;
}) {
  const isStoredHtml = contentType === "html";

  return (
    <article className="space-y-6">
      <div className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium">
        {category === "TRAINING" ? (
          <GraduationCap className="size-3.5" />
        ) : category === "FREE" ? (
          <MessageSquare className="size-3.5" />
        ) : category === "ANONYMOUS" ? (
          <Ghost className="size-3.5" />
        ) : (
          <Building2 className="size-3.5" />
        )}
        {CATEGORY_LABEL[category] ?? category}
      </div>
      {description ? (
        isStoredHtml ? (
          <iframe
            title="본문 미리보기"
            srcDoc={sanitizeNoteHtml(description)}
            sandbox=""
            style={{
              width: "100%",
              minHeight: "400px",
              border: "none",
              borderRadius: "8px",
            }}
            className="bg-white dark:bg-card"
            onLoad={(e) => {
              const iframe = e.target as HTMLIFrameElement;
              try {
                if (iframe.contentWindow?.document.body) {
                  iframe.style.height = `${iframe.contentWindow.document.body.scrollHeight + 40}px`;
                }
              } catch {
                /* ignore */
              }
            }}
          />
        ) : boardDescriptionLooksLikeHtml(description) ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed [&_a]:break-words [&_img]:max-w-full [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(description) }}
          />
        ) : (
          <div className="rounded-lg border bg-muted/30 p-4">
            <MarkdownRenderer content={description} />
          </div>
        )
      ) : null}
      {attachments.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <FileText className="size-4" />
            첨부파일 ({attachments.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {attachments.map((att, idx) => (
              <FilePreviewDialog
                key={idx}
                url={att.url}
                name={att.name}
                triggerVariant="outline"
                triggerClassName="h-9 px-3 py-2 text-sm"
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
