"use client";

import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { FileText, GraduationCap, Building2 } from "lucide-react";

const CATEGORY_LABEL: Record<string, string> = {
  COMPANY: "회사 자료",
  TRAINING: "교육자료",
};

export function BoardPostContent({
  description,
  attachments,
  category,
}: {
  description: string;
  attachments: { url: string; name: string }[];
  category: string;
}) {
  return (
    <article className="space-y-6">
      <div className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium">
        {category === "TRAINING" ? (
          <GraduationCap className="size-3.5" />
        ) : (
          <Building2 className="size-3.5" />
        )}
        {CATEGORY_LABEL[category] ?? category}
      </div>
      {description ? (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <pre className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 font-sans text-sm leading-relaxed">
            {description}
          </pre>
        </div>
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
