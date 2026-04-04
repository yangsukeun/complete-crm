"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { AGENTS, type Agent, type AgentKey } from "@/lib/ai-hub/agents";
import type { HistoryItem } from "@/lib/ai-hub/types";
import { AgentCard } from "@/components/ai-hub/AgentCard";
import { ResultArea } from "@/components/ai-hub/ResultArea";
import { HistoryChips } from "@/components/ai-hub/HistoryChips";

export type { AgentKey, Agent } from "@/lib/ai-hub/agents";
export type { HistoryItem } from "@/lib/ai-hub/types";

const FALLBACK = "잠시 후 다시 시도해주세요";

function autoRoute(input: string): AgentKey {
  if (/cs|고객|문의|답변|클레임|환불|불만/i.test(input)) return "cs";
  if (/영상|스크립트|유튜브|릴스|쇼츠|대본/i.test(input)) return "video";
  if (/이미지|사진|썸네일|미드저니|midjourney|그림/i.test(input)) return "image";
  if (/코드|자동화|엑셀|스크립트|반복/i.test(input)) return "code";
  if (/비교|vs|차이|어떤게 나아/i.test(input)) return "compare";
  return "copy";
}

function parseCompareHistoryOutput(output: string): {
  claude: string;
  gpt: string;
  gemini: string;
} | null {
  try {
    const j = JSON.parse(output) as { claude?: string; gpt?: string; gemini?: string };
    if (
      typeof j.claude === "string" &&
      typeof j.gpt === "string" &&
      typeof j.gemini === "string"
    ) {
      return { claude: j.claude, gpt: j.gpt, gemini: j.gemini };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function AiHubClient() {
  const [selectedAgent, setSelectedAgent] = useState<AgentKey | null>(null);
  const [taskInput, setTaskInput] = useState("");
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [compareResults, setCompareResults] = useState<{
    claude: string;
    gpt: string;
    gemini: string;
  } | null>(null);

  const handleSubmit = useCallback(async () => {
    const trimmed = taskInput.trim();
    if (!trimmed) return;

    let agent = selectedAgent;
    if (agent == null) {
      agent = autoRoute(trimmed);
      setSelectedAgent(agent);
    }

    setIsLoading(true);
    setCompareResults(null);

    try {
      if (agent === "compare") {
        const res = await fetch("/api/ai-hub", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "compare", message: trimmed }),
        });
        const data = (await res.json()) as {
          error?: string;
          claude?: string;
          gpt?: string;
          gemini?: string;
        };
        if (!res.ok) {
          setResult(data.error ?? FALLBACK);
          toast.error(data.error ?? FALLBACK);
          return;
        }
        const pack = {
          claude: data.claude ?? FALLBACK,
          gpt: data.gpt ?? FALLBACK,
          gemini: data.gemini ?? FALLBACK,
        };
        setCompareResults(pack);
        setResult("");
        const agentMeta = AGENTS.find((a) => a.key === "compare")!;
        const compareItem: HistoryItem = {
          id: crypto.randomUUID(),
          agentKey: "compare",
          agentName: agentMeta.name,
          input: trimmed,
          output: JSON.stringify(pack),
          createdAt: new Date(),
        };
        setHistory((prev) => [compareItem, ...prev].slice(0, 50));
      } else {
        const meta = AGENTS.find((a) => a.key === agent)!;
        const res = await fetch("/api/ai-hub", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "single",
            agentKey: agent,
            message: trimmed,
            systemPrompt: meta.systemPrompt,
          }),
        });
        const data = (await res.json()) as { error?: string; text?: string };
        if (!res.ok) {
          setResult(data.error ?? FALLBACK);
          toast.error(data.error ?? FALLBACK);
          return;
        }
        const text = data.text ?? FALLBACK;
        setResult(text);
        const row: HistoryItem = {
          id: crypto.randomUUID(),
          agentKey: agent,
          agentName: meta.name,
          input: trimmed,
          output: text,
          createdAt: new Date(),
        };
        setHistory((prev) => [row, ...prev].slice(0, 50));
      }
    } catch {
      setResult(FALLBACK);
      toast.error(FALLBACK);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAgent, taskInput]);

  const onCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      toast.success("복사했습니다.");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  }, [result]);

  const onRegenerate = useCallback(() => {
    void handleSubmit();
  }, [handleSubmit]);

  const onSaveToCrm = useCallback(async () => {
    const agent = selectedAgent;
    if (!agent) {
      toast.error("에이전트를 선택해 주세요.");
      return;
    }
    const meta = AGENTS.find((a) => a.key === agent);
    const input = taskInput.trim();
    let output = result;
    if (agent === "compare" && compareResults) {
      output = JSON.stringify(compareResults);
    } else if (agent === "compare" && result.trim()) {
      output = result;
    }
    if (!input || !output.trim()) {
      toast.error("저장할 내용이 없습니다.");
      return;
    }
    try {
      const res = await fetch("/api/ai-hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "saveHistory",
          agentKey: agent,
          agentName: meta?.name ?? agent,
          input,
          output,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "저장 실패");
      }
      toast.success("CRM에 저장했습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장에 실패했습니다.");
    }
  }, [selectedAgent, taskInput, result, compareResults]);

  const onMidjourneyOpen = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      window.open("https://www.midjourney.com", "_blank");
      toast.success("복사 후 Midjourney를 열었습니다.");
    } catch {
      toast.error("클립보드 복사에 실패했습니다.");
    }
  }, [result]);

  const onAdoptCompare = useCallback((text: string) => {
    setCompareResults(null);
    setResult(text);
  }, []);

  const onHistorySelect = useCallback((item: HistoryItem) => {
    setSelectedAgent(item.agentKey);
    setTaskInput(item.input);
    if (item.agentKey === "compare") {
      const parsed = parseCompareHistoryOutput(item.output);
      if (parsed) {
        setCompareResults(parsed);
        setResult("");
      } else {
        setCompareResults(null);
        setResult(item.output);
      }
    } else {
      setCompareResults(null);
      setResult(item.output);
    }
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-end gap-2">
        <div className="flex-1">
          <p className="mb-1.5 text-xs font-medium tracking-wide text-gray-400">
            지금 뭐가 필요하세요?
          </p>
          <textarea
            className="h-12 w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none"
            placeholder="예) 신상품 인스타 카피 써줘 / CS 답변 초안 / 유튜브 썸네일 프롬프트"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isLoading}
          className="h-12 shrink-0 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-5 text-sm transition-all hover:bg-gray-50 active:scale-95 disabled:opacity-50"
        >
          {isLoading ? "생성 중..." : "AI 연결 →"}
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {AGENTS.map((agent) => (
          <AgentCard
            key={agent.key}
            agent={agent}
            isSelected={selectedAgent === agent.key}
            onClick={() => setSelectedAgent(agent.key)}
          />
        ))}
      </div>

      <ResultArea
        selectedAgent={selectedAgent}
        isLoading={isLoading}
        result={result}
        compareResults={compareResults}
        onCopy={onCopy}
        onRegenerate={onRegenerate}
        onSaveToCrm={onSaveToCrm}
        onAdoptCompare={onAdoptCompare}
        onMidjourneyOpen={onMidjourneyOpen}
      />

      <HistoryChips history={history} onSelect={onHistorySelect} />
    </div>
  );
}
