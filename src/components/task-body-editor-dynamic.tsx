"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const TaskBodyEditor = dynamic(
  () => import("./task-body-editor").then((m: any) => m.TaskBodyEditor),
  { ssr: false }
);

type TaskBodyEditorDynamicProps = {
  taskId: string;
  initialDescription: string | null;
  onSaved: () => void;
  className?: string;
};

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
        {...({ taskId, initialDescription, onSaved } as any)}
      />
    </div>
  );
}
