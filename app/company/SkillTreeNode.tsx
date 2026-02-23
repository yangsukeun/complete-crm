"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export type SkillNodeData = {
  label: string;
  variant?: "start" | "branch" | "task";
};

export type SkillNode = Node<SkillNodeData, "skill">;

const glowColor: Record<"start" | "branch" | "task", string> = {
  start: "rgba(56, 189, 248, 0.6)",
  branch: "rgba(34, 211, 238, 0.5)",
  task: "rgba(52, 211, 153, 0.4)",
};

function SkillTreeNodeComponent({ data, selected }: NodeProps<SkillNode>) {
  const variant = (data?.variant ?? "task") as keyof typeof glowColor;
  const glow = glowColor[variant];
  const isStart = variant === "start";
  const isBranch = variant === "branch";

  return (
    <>
      {!isStart && <Handle type="target" position={Position.Top} className="!w-2 !h-2 !border-2 !bg-slate-800 !border-cyan-400" />}
      <div
        className="px-4 py-3 rounded-lg border-2 min-w-[140px] text-center transition-all duration-200"
        style={{
          backgroundColor: "rgba(15, 23, 42, 0.95)",
          borderColor: selected ? "rgb(34, 211, 238)" : "rgba(34, 211, 238, 0.5)",
          boxShadow: selected
            ? `0 0 20px ${glow}, 0 0 40px ${glow}`
            : `0 0 12px ${glow}`,
        }}
      >
        <span
          className={`font-semibold text-slate-100 whitespace-nowrap ${isStart ? "text-lg" : isBranch ? "text-base" : "text-sm"}`}
        >
          {data?.label ?? ""}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !border-2 !bg-slate-800 !border-cyan-400" />
    </>
  );
}

export const SkillTreeNode = memo(SkillTreeNodeComponent);
