"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type BoardRevisionEditDto = {
  id: string;
  userName: string;
  createdAt: string;
  changedFields: unknown;
  legacyPayload?: unknown;
};

function formatRevDate(iso: string) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "yyyy.MM.dd HH:mm", { locale: ko });
  } catch {
    return "";
  }
}

function getRevisionLabel(changedFields: unknown, legacyPayload: unknown): string {
  const fields =
    Array.isArray(changedFields) && changedFields.every((x) => typeof x === "string")
      ? (changedFields as string[])
      : null;

  if (fields && fields.length > 0) {
    const labels: Record<string, string> = {
      title: "제목",
      description: "내용",
      contentType: "내용",
      category: "구분",
      attachments: "첨부파일",
    };
    const human = [...new Set(fields.map((f) => labels[f] ?? f))];
    return `${human.join(", ")} 수정`;
  }

  if (legacyPayload != null) return "내용 수정";
  return "내용 수정";
}

function avatarLetter(name: string) {
  const t = name.trim();
  if (!t) return "?";
  const c = t[0];
  return /[a-zA-Z가-힣0-9]/.test(c) ? c.toUpperCase() : "?";
}

type Row =
  | { kind: "edit"; key: string; userName: string; createdAt: string; label: string }
  | { kind: "initial"; key: string; userName: string; createdAt: string; label: string };

export function BoardPostRevisionHistory({
  edits,
  initialAuthorName,
  initialCreatedAtIso,
}: {
  edits: BoardRevisionEditDto[];
  initialAuthorName: string;
  initialCreatedAtIso: string;
}) {
  const [open, setOpen] = useState(false);

  const rows = useMemo((): Row[] => {
    const editRows: Row[] = edits.map((rev) => ({
      kind: "edit" as const,
      key: rev.id,
      userName: rev.userName || "알 수 없음",
      createdAt: rev.createdAt,
      label: getRevisionLabel(rev.changedFields, rev.legacyPayload ?? null),
    }));
    editRows.push({
      kind: "initial",
      key: "initial",
      userName: initialAuthorName || "알 수 없음",
      createdAt: initialCreatedAtIso,
      label: "최초 작성",
    });
    return editRows;
  }, [edits, initialAuthorName, initialCreatedAtIso]);

  const total = rows.length;

  return (
    <div className="mt-6 border-t border-[#f1f3f4] pt-0 dark:border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-3 text-left text-[13px] font-medium text-[#70757a] transition-colors hover:text-[#3c4043] dark:text-muted-foreground dark:hover:text-foreground"
      >
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
        수정 이력 ({total}건)
      </button>

      {open && (
        <div className="border-t border-[#f1f3f4] py-2 dark:border-border">
          {rows.map((row, i) => (
            <div
              key={row.key}
              className={cn(
                "flex items-center gap-3 py-2 text-[13px]",
                i < rows.length - 1 && "border-b border-[#f8f9fa] dark:border-border/60"
              )}
            >
              <div
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1a73e8] text-xs font-semibold text-white"
                aria-hidden
              >
                {avatarLetter(row.userName)}
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-[#3c4043] dark:text-foreground">{row.userName}</span>
                <span className="ml-2 text-xs text-[#70757a] dark:text-muted-foreground">
                  {formatRevDate(row.createdAt)}
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-[#f1f3f4] px-2 py-0.5 text-xs text-[#70757a] dark:bg-muted dark:text-muted-foreground">
                {row.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
