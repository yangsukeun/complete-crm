import { cn } from "@/lib/utils";

/** CS 화면 전용 스케일 래퍼. 본사 대시보드·게시판에는 쓰지 않는다. */
export function CsScreen({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-cs-screen className={cn("flex flex-col gap-8 p-6 md:p-8", className)}>
      {children}
    </div>
  );
}
