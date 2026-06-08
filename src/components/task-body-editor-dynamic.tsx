"use client";

import { forwardRef } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { TaskBodyEditorHandle, TaskBodyEditorProps } from "./task-body-editor";

export type { TaskBodyEditorHandle };

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

export const TaskBodyEditorDynamic = forwardRef<TaskBodyEditorHandle, TaskBodyEditorDynamicProps>(
  function TaskBodyEditorDynamic(
    {
      taskId,
      initialDescription,
      bodyVersionRef,
      onSaved,
      className,
      bodyMeta,
      currentUserName,
      currentUserId,
    },
    ref
  ) {
    return (
      <div className={cn("w-full", className)}>
        <TaskBodyEditor
          ref={ref}
          key={taskId}
          taskId={taskId}
          initialDescription={initialDescription}
          bodyVersionRef={bodyVersionRef}
          onSaved={onSaved}
          className={className}
          bodyMeta={bodyMeta}
          currentUserName={currentUserName}
          currentUserId={currentUserId}
        />
      </div>
    );
  }
);
