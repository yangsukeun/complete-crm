"use client";

import { useCallback } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { TaskDetailContent } from "../../app/tasks/components/task-detail-content";

type Props = {
  taskId: string | null;
  onClose: () => void;
  onUpdate: () => void;
  /** 마인드맵 등에서 우측 패널 너비를 줄일 때 */
  narrow?: boolean;
};

export function TaskDetailDrawer({ taskId, onClose, onUpdate, narrow = false }: Props) {
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose]
  );

  return (
    <Sheet open={!!taskId} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={true}
        ariaTitle="프로젝트 상세"
        className={cn(
          "max-h-[100vh] overflow-hidden gap-0 border-0 bg-background p-0",
          /* Sheet 기본 w-3/4·sm:max-w-xl 을 반드시 덮어써야 실제로 좁아짐 */
          narrow
            ? "w-full !max-w-[min(92vw,20rem)] sm:!max-w-md"
            : "w-full sm:max-w-[min(96vw,1680px)]"
        )}
      >
        {taskId ? <TaskDetailContent taskId={taskId} onUpdate={onUpdate} /> : null}
      </SheetContent>
    </Sheet>
  );
}
