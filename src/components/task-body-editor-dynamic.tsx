"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { TaskBodyEditorProps } from "./task-body-editor";

// [PERF-C] BlockNote 에디터 청크 분리 + 로딩 스켈레톤
const TaskBodyEditor = dynamic(
  () => import("./task-body-editor").then((m) => m.TaskBodyEditor),
  {
    ssr: false,
    loading: () => (
      <div
        className="animate-pulse rounded-md border border-muted bg-muted/40"
        style={{ minHeight: 280 }}
        aria-hidden
      />
    ),
  }
);

type TaskBodyEditorDynamicProps = TaskBodyEditorProps;

export function TaskBodyEditorDynamic({
  taskId,
  initialDescription,
  onSaved,
  className,
}: TaskBodyEditorDynamicProps) {
  return (
    <div className={cn("w-full", className)}>
      <TaskBodyEditor
        key={taskId}
        taskId={taskId}
        initialDescription={initialDescription}
        onSaved={onSaved}
        className={className}
      />
    </div>
  );
}
