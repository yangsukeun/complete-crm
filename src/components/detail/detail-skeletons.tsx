import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** 업무 상세 (/tasks/[id]) 로딩 */
export function TaskDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto min-w-0 max-w-3xl box-border px-4 py-6 md:px-8">
        <div className="mb-6 flex items-center justify-between gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="mb-6 h-4 w-full max-w-md" />
        <div className="flex items-start gap-3 px-2">
          <Skeleton className="mt-1 size-5 rounded" />
          <Skeleton className="size-8 rounded" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-9 w-3/4 max-w-xl" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="mt-8 space-y-3 border-t border-border/40 px-0 py-8">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
        <div className="space-y-2 border-t px-2 py-6">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** 견적서 상세 (/quotations/[id]) */
export function QuotationDetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-10 w-2/3 max-w-lg" />
      <div className="space-y-4 rounded-lg border bg-card p-8">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-40 w-full rounded-md" />
        <div className="space-y-2 pt-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

/** 게시판 상세 (/board/[id]) */
export function BoardPostSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <Skeleton className="h-5 w-24" />
      <div className="space-y-3">
        <Skeleton className="h-10 w-2/3 max-w-xl" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="min-h-[200px] w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}

/** 채팅 메시지 영역 */
export function ChatMessagesSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={i % 2 === 0 ? "flex justify-end" : "flex justify-start"}>
          <Skeleton className={cn("h-16 rounded-2xl", i % 2 === 0 ? "w-[72%]" : "w-[80%]")} />
        </div>
      ))}
    </div>
  );
}
