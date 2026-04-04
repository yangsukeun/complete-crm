"use client";

import type { AgentKey } from "@/lib/ai-hub/agents";
import { AGENTS } from "@/lib/ai-hub/agents";

function modelLabelFor(agentKey: AgentKey | null): string {
  if (!agentKey) return "";
  const a = AGENTS.find((x) => x.key === agentKey);
  if (!a) return "";
  if (a.model === "all") return "Claude / GPT / Gemini";
  if (a.model === "claude") return "Claude";
  return a.model;
}

export function ResultArea({
  selectedAgent,
  isLoading,
  result,
  compareResults,
  onCopy,
  onRegenerate,
  onSaveToCrm,
  onAdoptCompare,
  onMidjourneyOpen,
}: {
  selectedAgent: AgentKey | null;
  isLoading: boolean;
  result: string;
  compareResults: { claude: string; gpt: string; gemini: string } | null;
  onCopy: () => void;
  onRegenerate: () => void;
  onSaveToCrm: () => void;
  onAdoptCompare: (text: string) => void;
  onMidjourneyOpen: () => void;
}) {
  const agentName = selectedAgent
    ? AGENTS.find((a) => a.key === selectedAgent)?.name
    : null;
  const headerTitle =
    selectedAgent && agentName
      ? agentName
      : result
        ? "생성 결과"
        : "용도를 선택하거나 위에 입력해주세요";
  const modelLabel = modelLabelFor(selectedAgent);

  const isCompareGrid =
    selectedAgent === "compare" && (isLoading || compareResults !== null);

  if (isCompareGrid) {
    const labels = ["Claude", "GPT", "Gemini"] as const;
    const texts = compareResults
      ? ([compareResults.claude, compareResults.gpt, compareResults.gemini] as const)
      : null;

    return (
      <div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {labels.map((label, i) => (
            <div
              key={label}
              className="min-h-[140px] rounded-xl border border-gray-100 bg-gray-50 p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium">{label}</span>
              </div>
              {isLoading || !texts ? (
                <div className="space-y-2">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200" />
                  <div className="h-3 w-full animate-pulse rounded bg-gray-200" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-gray-600 whitespace-pre-wrap">{texts[i]}</p>
              )}
              {!isLoading && texts && (
                <button
                  type="button"
                  onClick={() => onAdoptCompare(texts[i])}
                  className="mt-3 w-full rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] hover:bg-gray-50"
                >
                  이 답변 채택
                </button>
              )}
            </div>
          ))}
        </div>
        {!isLoading && texts && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={onSaveToCrm}
              className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100"
            >
              CRM에 저장 ✓
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-[140px] rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium">{headerTitle}</span>
        <span className="text-[11px] text-gray-400">{modelLabel}</span>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-full animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-gray-600 whitespace-pre-wrap">{result}</p>
      )}
      {result && !isLoading && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={onCopy}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] hover:bg-gray-50"
          >
            복사
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] hover:bg-gray-50"
          >
            다시 생성
          </button>
          <button
            type="button"
            onClick={onSaveToCrm}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100"
          >
            CRM에 저장 ✓
          </button>
          {selectedAgent === "image" && (
            <button
              type="button"
              onClick={onMidjourneyOpen}
              className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700 hover:bg-amber-100"
            >
              Midjourney 열기 ↗
            </button>
          )}
        </div>
      )}
    </div>
  );
}
