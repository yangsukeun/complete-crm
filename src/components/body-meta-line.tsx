import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";

function formatBodyDateTime(iso?: string | Date | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "yyyy.MM.dd HH:mm", { locale: ko });
}

export type BodyMetaProps = {
  authorId?: string | null;
  authorName?: string | null;
  editorName?: string | null;
  createdAtIso?: string | Date | null;
  updatedAtIso?: string | Date | null;
  className?: string;
};

function buildMetaRows({
  authorName,
  editorName,
  createdAtIso,
  updatedAtIso,
}: BodyMetaProps) {
  const author = authorName?.trim() || "—";
  const editor = editorName?.trim() || null;
  const created = formatBodyDateTime(createdAtIso);
  const updated = formatBodyDateTime(updatedAtIso);
  const showEditor =
    !!editor && (editor !== author || (updated && created && updated !== created));

  const rows: { label: string; value: string }[] = [
    { label: "작성자", value: author },
    { label: "작성", value: created ?? "—" },
  ];

  if (showEditor) {
    rows.push({ label: "수정자", value: editor! });
    rows.push({ label: "수정", value: updated ?? "—" });
  } else if (updated && created && updated !== created) {
    rows.push({ label: "수정", value: updated });
  }

  return rows;
}

/** 본문 칸 우측 열: 라벨 | 값 행별 표시 */
export function BodyMetaColumn({
  authorName,
  editorName,
  createdAtIso,
  updatedAtIso,
  className,
}: BodyMetaProps) {
  const rows = buildMetaRows({ authorName, editorName, createdAtIso, updatedAtIso });

  return (
    <div
      className={cn(
        "text-muted-foreground w-[10.5rem] shrink-0 border-l border-border/40 pl-3 sm:w-[11.5rem]",
        className
      )}
      aria-label="본문 작성·수정 정보"
    >
      <dl className="m-0 space-y-2 text-[11px] leading-snug">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[3.25rem_1fr] gap-x-2 gap-y-0.5">
            <dt className="text-muted-foreground/75 font-medium">{row.label}</dt>
            <dd className="m-0 min-w-0 break-words text-right tabular-nums text-foreground/80">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** 한 줄 요약 (좁은 화면·다른 경로용) */
export function BodyMetaLine(props: BodyMetaProps) {
  const rows = buildMetaRows(props);
  return (
    <p
      className={cn(
        "text-muted-foreground text-right text-[11px] leading-snug tabular-nums",
        props.className
      )}
    >
      {rows.map((row, i) => (
        <span key={row.label}>
          {i > 0 ? <span className="mx-1.5 text-border/80">·</span> : null}
          {row.label} {row.value}
        </span>
      ))}
    </p>
  );
}
