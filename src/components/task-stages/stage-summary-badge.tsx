import { cn } from "@/lib/utils";
import type { StageStatus } from "./types";

export type StageSummaryItem = { name: string; status: StageStatus };

/** 프로젝트 목록용 단계 요약: "3/8단계 · 공간 조성" + 단계별 칸 표시. 단계가 없으면 아무것도 그리지 않는다 */
export function StageSummaryBadge({ stages, className }: { stages?: StageSummaryItem[] | null; className?: string }) {
  if (!stages || stages.length === 0) return null;
  const activeIndex = stages.findIndex((s) => s.status === "ACTIVE");
  const allDone = stages.every((s) => s.status === "DONE");
  const label = allDone
    ? `${stages.length}단계 모두 완료`
    : activeIndex >= 0
      ? `${activeIndex + 1}/${stages.length}단계 · ${stages[activeIndex].name}`
      : `단계 ${stages.length}개`;
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-1.5 text-[11px]", allDone ? "text-emerald-700" : "text-sky-800", className)}
      title={stages.map((s, i) => `${i + 1}. ${s.name}`).join("\n")}
    >
      <span className="flex shrink-0 gap-px" aria-hidden>
        {stages.map((s, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-2 rounded-sm",
              s.status === "DONE" ? "bg-emerald-500" : s.status === "ACTIVE" ? "bg-sky-500" : "bg-gray-200"
            )}
          />
        ))}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}
