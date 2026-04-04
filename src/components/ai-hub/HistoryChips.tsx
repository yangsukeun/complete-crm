"use client";

import type { HistoryItem } from "@/lib/ai-hub/types";

export function HistoryChips({
  history,
  onSelect,
}: {
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
}) {
  return (
    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
      {history.slice(0, 6).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className="flex-shrink-0 whitespace-nowrap rounded-full border border-gray-100 px-3 py-1.5 text-[11px] text-gray-500 hover:bg-gray-50"
        >
          {item.agentName} — {item.input.slice(0, 15)}
          {item.input.length > 15 ? "..." : ""}
        </button>
      ))}
    </div>
  );
}
