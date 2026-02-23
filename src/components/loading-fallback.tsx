/**
 * 페이지 전환 시 즉시 표시되는 로딩 UI.
 * 라우트별 loading.tsx에서 사용해 체감 속도를 높입니다.
 */
export function LoadingFallback({ label = "로딩 중..." }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-muted-foreground text-sm">{label}</p>
      </div>
    </div>
  );
}
