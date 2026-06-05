import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";

/**
 * "작성 OOO · 최종수정 OOO · MM.DD" 한 줄 표시.
 * - 작성자 == 최종수정자(또는 최종수정자 없음)면 "작성 OOO · MM.DD"로 축약.
 * - authorName이 비어 있으면(과거 데이터 등) "작성자 정보 없음".
 */
export function AuthorMetaLine({
  authorName,
  editorName,
  dateIso,
  className,
}: {
  authorName?: string | null;
  editorName?: string | null;
  dateIso?: string | Date | null;
  className?: string;
}) {
  let date: string | null = null;
  if (dateIso) {
    const d = new Date(dateIso);
    if (!Number.isNaN(d.getTime())) date = format(d, "MM.dd", { locale: ko });
  }
  const author = authorName?.trim() || "작성자 정보 없음";
  const editor = editorName?.trim();
  const showEditor = !!editor && editor !== author;
  return (
    <span className={cn("text-muted-foreground text-xs", className)}>
      작성 {author}
      {showEditor ? ` · 최종수정 ${editor}` : ""}
      {date ? ` · ${date}` : ""}
    </span>
  );
}
