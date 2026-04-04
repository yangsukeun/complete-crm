"use client";

import type { Agent } from "@/lib/ai-hub/agents";
import { Headphones, PenLine, Clapperboard, ImageIcon, Code2, Scale } from "lucide-react";

function AgentIcon({ agentKey }: { agentKey: Agent["key"] }) {
  const cls = "size-3.5 text-gray-600";
  switch (agentKey) {
    case "cs":
      return <Headphones className={cls} aria-hidden />;
    case "copy":
      return <PenLine className={cls} aria-hidden />;
    case "video":
      return <Clapperboard className={cls} aria-hidden />;
    case "image":
      return <ImageIcon className={cls} aria-hidden />;
    case "code":
      return <Code2 className={cls} aria-hidden />;
    case "compare":
      return <Scale className={cls} aria-hidden />;
    default:
      return null;
  }
}

export function AgentCard({
  agent,
  isSelected,
  onClick,
}: {
  agent: Agent;
  isSelected: boolean;
  onClick: () => void;
}) {
  const base =
    "rounded-xl p-3 cursor-pointer transition-colors text-left w-full border";
  const idle = "border-gray-100 hover:border-gray-200";
  const active = "border-2 border-blue-200 bg-blue-50/30";

  const badgeClass =
    agent.badge === "internal"
      ? "bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full mt-1.5 inline-block"
      : agent.badge === "external"
        ? "bg-amber-50 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full mt-1.5 inline-block"
        : "bg-violet-50 text-violet-700 text-[10px] px-1.5 py-0.5 rounded-full mt-1.5 inline-block";

  return (
    <button type="button" onClick={onClick} className={`${base} ${isSelected ? active : idle}`}>
      <div
        className={`mb-2 flex h-7 w-7 items-center justify-center rounded-md text-sm ${agent.color}`}
      >
        <AgentIcon agentKey={agent.key} />
      </div>
      <p className="mb-0.5 text-xs font-medium">{agent.name}</p>
      <p className="text-[11px] leading-snug text-gray-400">{agent.desc}</p>
      <span className={badgeClass}>{agent.badgeLabel}</span>
    </button>
  );
}
