/**
 * 페이지 제목: CS 화면과 같은 큰 스케일 (22px/800)
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
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ""}`}>
      <h1 className="text-[1.375rem] font-extrabold tracking-tight text-foreground md:text-2xl">
        {title}
      </h1>
      {description && (
        <p className="text-muted-foreground max-w-3xl text-sm font-medium leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
