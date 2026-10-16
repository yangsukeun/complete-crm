import { cn } from "@/lib/utils";

export function StageProgressBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cn("h-full rounded-full transition-all", v >= 100 ? "bg-emerald-500" : "bg-sky-500")}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{v}%</span>
    </div>
  );
}
