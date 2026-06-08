import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";

function formatBodyDateTime(iso?: string | Date | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "yyyy.MM.dd HH:mm", { locale: ko });
}

/** 본문 칸 우측: 작성자·작성시간, 수정자·수정시간 */
export function BodyMetaLine({
  authorName,
  editorName,
  createdAtIso,
  updatedAtIso,
  className,
}: {
  authorName?: string | null;
  editorName?: string | null;
  createdAtIso?: string | Date | null;
  updatedAtIso?: string | Date | null;
  className?: string;
}) {
  const author = authorName?.trim() || "—";
  const editor = editorName?.trim() || null;
  const created = formatBodyDateTime(createdAtIso);
  const updated = formatBodyDateTime(updatedAtIso);
  const showEditor =
    !!editor && (editor !== author || (updated && created && updated !== created));

  return (
    <p
      className={cn(
        "text-muted-foreground text-right text-[11px] leading-snug tabular-nums",
        className
      )}
    >
      <span>
        작성 {author}
        {created ? ` · ${created}` : ""}
      </span>
      {showEditor ? (
        <>
          <span className="mx-1.5 hidden sm:inline text-border/80">|</span>
          <span className="block sm:inline sm:ml-0 mt-0.5 sm:mt-0">
            수정 {editor}
            {updated ? ` · ${updated}` : ""}
          </span>
        </>
      ) : updated && created && updated !== created ? (
        <span> · 수정 {updated}</span>
      ) : null}
    </p>
  );
}
