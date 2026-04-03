"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type AIAssistTarget = {
  getValue: () => string;
  onChange: (value: string) => void;
  getTopic?: () => string;
};

type ContextValue = {
  target: AIAssistTarget | null;
  register: (t: AIAssistTarget) => void;
  unregister: () => void;
};

const AIAssistContext = createContext<ContextValue | null>(null);

/** // [PERF-F] 경량 Context — 지연 로딩 불필요 */
export function AIAssistProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<AIAssistTarget | null>(null);
  const register = useCallback((t: AIAssistTarget) => setTarget(() => t), []);
  const unregister = useCallback(() => setTarget(null), []);
  return (
    <AIAssistContext.Provider value={{ target, register, unregister }}>
      {children}
    </AIAssistContext.Provider>
  );
}

export function useAIAssistTarget() {
  const ctx = useContext(AIAssistContext);
  return ctx;
}
