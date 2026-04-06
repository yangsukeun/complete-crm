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
  onSaveCompareModel,
  onMidjourneyOpen,
}: {
  selectedAgent: AgentKey | null;
  isLoading: boolean;
  result: string;
  compareResults: { claude: string; gpt: string; gemini: string } | null;
  onCopy: () => void;
  onRegenerate: () => void;
  onSaveToCrm: () => void;
  onSaveCompareModel: (model: "claude" | "gpt" | "gemini", content: string) => void | Promise<void>;
  onMidjourneyOpen: () => void;
}) {
  const currentAgent = selectedAgent ? AGENTS.find((a) => a.key === selectedAgent) : null;
  const agentName = currentAgent?.name ?? null;
  const headerTitle =
    selectedAgent && agentName
      ? agentName
      : result
        ? "생성 결과"
        : "용도를 선택하거나 위에 입력해주세요";
  const modelLabel = modelLabelFor(selectedAgent);

  const isMultiCompare =
    currentAgent?.model === "all" && (isLoading || compareResults !== null);

  if (isMultiCompare) {
    const c = compareResults?.claude ?? "";
    const g = compareResults?.gpt ?? "";
    const gm = compareResults?.gemini ?? "";
    const fallback = "잠시 후 다시 시도해주세요";

    return (
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {/* Claude */}
        <div className="rounded-xl border border-violet-100 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-violet-700">Claude</span>
            <span className="text-[10px] text-gray-400">Anthropic</span>
          </div>
          {isLoading && !compareResults ? (
            <div className="min-h-[100px] space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-full animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
            </div>
          ) : (
            <p className="min-h-[100px] text-xs leading-relaxed whitespace-pre-wrap text-gray-600">
              {c || fallback}
            </p>
          )}
          {!isLoading && compareResults && (
            <div className="mt-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(c || fallback)}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] hover:bg-gray-50"
              >
                복사
              </button>
              <button
                type="button"
                onClick={() => void onSaveCompareModel("claude", c || fallback)}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100"
              >
                채택 ✓
              </button>
            </div>
          )}
        </div>

        {/* GPT */}
        <div className="rounded-xl border border-green-100 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-green-700">GPT-4o</span>
            <span className="text-[10px] text-gray-400">OpenAI</span>
          </div>
          {isLoading && !compareResults ? (
            <div className="min-h-[100px] space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-full animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
            </div>
          ) : (
            <p className="min-h-[100px] text-xs leading-relaxed whitespace-pre-wrap text-gray-600">
              {g || fallback}
            </p>
          )}
          {!isLoading && compareResults && (
            <div className="mt-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(g || fallback)}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] hover:bg-gray-50"
              >
                복사
              </button>
              <button
                type="button"
                onClick={() => void onSaveCompareModel("gpt", g || fallback)}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100"
              >
                채택 ✓
              </button>
            </div>
          )}
        </div>

        {/* Gemini */}
        <div className="rounded-xl border border-blue-100 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-blue-700">Gemini</span>
            <span className="text-[10px] text-gray-400">Google</span>
          </div>
          {isLoading && !compareResults ? (
            <div className="min-h-[100px] space-y-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-full animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
            </div>
          ) : (
            <p className="min-h-[100px] text-xs leading-relaxed whitespace-pre-wrap text-gray-600">
              {gm || fallback}
            </p>
          )}
          {!isLoading && compareResults && (
            <div className="mt-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(gm || fallback)}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] hover:bg-gray-50"
              >
                복사
              </button>
              <button
                type="button"
                onClick={() => void onSaveCompareModel("gemini", gm || fallback)}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-100"
              >
                채택 ✓
              </button>
            </div>
          )}
        </div>
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
        <p className="text-xs leading-relaxed whitespace-pre-wrap text-gray-600">{result}</p>
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
