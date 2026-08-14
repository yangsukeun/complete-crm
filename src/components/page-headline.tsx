/**
 * 페이지 헤드라인: 보라색 뱃지 스타일로 한 줄에 표시해 구분
 */
export function PageHeadline({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <span className="inline-flex shrink-0 items-center rounded-md bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground shadow-sm">
        {title}
      </span>
      {description && (
        <span className="text-muted-foreground text-sm font-medium">{description}</span>
      )}
    </div>
  );
}
