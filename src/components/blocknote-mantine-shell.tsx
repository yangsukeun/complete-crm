"use client";

import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import type { ReactNode } from "react";

/**
 * BlockNote `@blocknote/mantine`는 Mantine 컨텍스트가 없으면 색/배경이 깨져 검은 화면처럼 보일 수 있음.
 * 에디터 트리마다 라이트 스킴을 고정해 부모 다크 UI와 무관하게 본문이 보이게 함.
 */
export function BlockNoteMantineShell({ children }: { children: ReactNode }) {
  return <MantineProvider forceColorScheme="light">{children}</MantineProvider>;
}
