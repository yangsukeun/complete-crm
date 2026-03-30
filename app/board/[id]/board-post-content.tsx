"use client";

import { useEffect, useState } from "react";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { BoardBlockDocViewer } from "@/components/board-block-doc-viewer";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import {
  boardDescriptionLooksLikeHtml,
  decodeCommonHtmlEntities,
  unwrapMarkdownHtmlCodeFence,
} from "@/lib/board-body";
import { parseStoredTaskBody } from "@/lib/task-body-description";
import { sanitizeNoteHtml } from "@/lib/sanitize-note-html";
import { FileText, GraduationCap, Building2, MessageSquare, Ghost } from "lucide-react";

/**
 * BlockNote 내부 Suspense와 next/dynamic 조합 시 하이드레이션에서 React #419가 날 수 있어,
 * 첫 페인트(서버·클라이언트)는 동일한 플레이스홀더만 쓰고, 마운트 이후에만 뷰어를 넣습니다.
 */
function BoardBlockViewerGate({ blocks }: { blocks: unknown[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground dark:border-border">
        본문 블록을 불러오는 중…
      </div>
    );
  }
  return <BoardBlockDocViewer blocks={blocks} />;
}

/**
 * DOMPurify·마크다운 파이프라인은 Node와 브라우저에서 미세하게 달라질 수 있어
 * sanitize된 HTML / ReactMarkdown을 초기 HTML과 분리(마운트 이후만 그리기).
 */
function HydrationSafeRichBody({
  showAsSanitizedHtml,
  forHtmlDetect,
  description,
  proseHtmlClass,
}: {
  showAsSanitizedHtml: boolean;
  forHtmlDetect: string;
  description: string;
  proseHtmlClass: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return (
      <div className="min-h-[120px] rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground dark:border-border">
        본문을 불러오는 중…
      </div>
    );
  }
  if (showAsSanitizedHtml) {
    return (
      <div
        className={proseHtmlClass}
        dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(forHtmlDetect) }}
      />
    );
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <MarkdownRenderer content={description} />
    </div>
  );
}

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
  const structured = !isStoredHtml && description ? parseStoredTaskBody(description) : null;

  const unwrapped = description ? unwrapMarkdownHtmlCodeFence(description) : "";
  /** 엔티티 이스케이프만 된 HTML은 마크다운으로 가면 태그가 텍스트처럼 보임 */
  const decodedTry = unwrapped.trim() ? decodeCommonHtmlEntities(unwrapped) : unwrapped;
  const forHtmlDetect = boardDescriptionLooksLikeHtml(unwrapped)
    ? unwrapped
    : boardDescriptionLooksLikeHtml(decodedTry)
      ? decodedTry
      : unwrapped;
  const showAsSanitizedHtml =
    Boolean(forHtmlDetect.trim()) &&
    (isStoredHtml || boardDescriptionLooksLikeHtml(forHtmlDetect));

  const proseHtmlClass =
    "prose prose-sm max-w-none dark:prose-invert rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed [&_a]:break-words [&_img]:max-w-full [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto";

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
        !isStoredHtml &&
        structured?.format === "blocks" &&
        Array.isArray(structured.blocks) &&
        structured.blocks.length > 0 ? (
          <BoardBlockViewerGate blocks={structured.blocks as unknown[]} />
        ) : (
          <HydrationSafeRichBody
            showAsSanitizedHtml={showAsSanitizedHtml}
            forHtmlDetect={forHtmlDetect}
            description={description}
            proseHtmlClass={proseHtmlClass}
          />
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
