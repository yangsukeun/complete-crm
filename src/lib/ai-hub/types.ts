import type { AgentKey } from "@/lib/ai-hub/agents";

export type HistoryItem = {
  id: string;
  agentKey: AgentKey;
  agentName: string;
  input: string;
  output: string;
  createdAt: Date;
};
