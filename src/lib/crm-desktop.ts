"use client";

import { useSyncExternalStore } from "react";

/**
 * 윈도우 데스크톱 앱(desktop/, Electron)이 preload로 노출하는 API.
 * 웹 브라우저에서는 window.crmDesktop 이 없으므로 훅이 null 을 돌려준다.
 */
export type CrmDesktopResult = { ok: true } | { ok: false; code: string; message: string };

export type CrmDesktopApi = {
  isDesktop: true;
  platform: string;
  /** NAS File Station 경로(/문서공유/...)의 파일을 PC 연결 프로그램으로 연다 */
  openNasFile: (nasPath: string) => Promise<CrmDesktopResult>;
  /** NAS 항목을 탐색기에서 보여 준다(폴더면 그 폴더를 연다) */
  revealNasItem: (nasPath: string) => Promise<CrmDesktopResult>;
  /** 구글 드라이브 탐색기 루트 기준 경로 조각의 파일을 연다 */
  openDriveFile: (segments: string[]) => Promise<CrmDesktopResult>;
  /** 구글 드라이브 항목을 탐색기에서 보여 준다 */
  revealDriveItem: (segments: string[]) => Promise<CrmDesktopResult>;
};

declare global {
  interface Window {
    crmDesktop?: Partial<CrmDesktopApi>;
  }
}

function getDesktop(): CrmDesktopApi | null {
  const d = window.crmDesktop;
  // 1단계(로컬 파일 API 이전) 앱에서는 버튼을 보여 주지 않는다
  return d?.isDesktop && typeof d.openNasFile === "function" ? (d as CrmDesktopApi) : null;
}

const subscribe = () => () => {};

/** 데스크톱 앱 안이면 API, 웹 브라우저면 null (서버 렌더링 시에도 null) */
export function useCrmDesktop(): CrmDesktopApi | null {
  return useSyncExternalStore(subscribe, getDesktop, () => null);
}

/**
 * 구글 문서·시트·슬라이드는 Drive for desktop 에서 .gdoc 등 바로가기 파일로 보인다.
 * 그 외 구글 형식(폼 등)도 PC에서 직접 편집할 수 없으므로 "PC에서 열기" 대상이 아니다.
 */
const GOOGLE_APPS_EXT: Record<string, string> = {
  "application/vnd.google-apps.document": ".gdoc",
  "application/vnd.google-apps.spreadsheet": ".gsheet",
  "application/vnd.google-apps.presentation": ".gslides",
  "application/vnd.google-apps.form": ".gform",
  "application/vnd.google-apps.drawing": ".gdraw",
  "application/vnd.google-apps.site": ".gsite",
  "application/vnd.google-apps.jam": ".gjam",
  "application/vnd.google-apps.map": ".gmap",
};

export function isGoogleAppsFile(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType?.startsWith("application/vnd.google-apps.")) &&
    mimeType !== "application/vnd.google-apps.folder";
}

/** PC(Drive for desktop)에서 보이는 파일 이름 */
export function driveLocalFileName(name: string, mimeType: string | null | undefined): string {
  const ext = mimeType ? GOOGLE_APPS_EXT[mimeType] : undefined;
  return ext && !name.endsWith(ext) ? name + ext : name;
}
