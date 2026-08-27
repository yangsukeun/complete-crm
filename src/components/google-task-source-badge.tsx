import { Badge } from "@/components/ui/badge";

export function GoogleTaskSourceBadge({
  syncedFromGoogle,
  className,
}: {
  syncedFromGoogle?: boolean | null;
  className?: string;
}) {
  if (!syncedFromGoogle) return null;
  return (
    <Badge
      variant="outline"
      className={
        className ??
        "border-sky-300 bg-sky-50 text-[10px] font-semibold text-sky-800 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-200"
      }
    >
      구글
    </Badge>
  );
}
