const { contextBridge, ipcRenderer } = require("electron");

/**
 * 웹 CRM이 데스크톱 앱 안에서 실행 중인지 알 수 있도록 노출한다.
 * 웹 쪽에서는 `window.crmDesktop?.isDesktop` 으로 확인한다.
 *
 * 로컬 파일 API는 모두 { ok: true } | { ok: false, code, message } 를 돌려준다.
 * 경로는 앱이 설정된 루트(NAS 문서함·구글 드라이브 폴더) 안으로 제한한다.
 */
contextBridge.exposeInMainWorld("crmDesktop", {
  isDesktop: true,
  platform: process.platform,
  retry: () => ipcRenderer.send("crm:retry"),

  /** NAS File Station 경로(/문서공유/...)의 파일을 PC 연결 프로그램으로 연다 */
  openNasFile: (nasPath) => ipcRenderer.invoke("crm:nas-open", String(nasPath)),
  /** NAS 항목을 탐색기에서 보여 준다(폴더면 그 폴더를 연다) */
  revealNasItem: (nasPath) => ipcRenderer.invoke("crm:nas-reveal", String(nasPath)),
  /** 구글 드라이브 탐색기 루트 기준 경로 조각(["폴더", "파일.xlsx"])의 파일을 연다 */
  openDriveFile: (segments) => ipcRenderer.invoke("crm:drive-open", Array.from(segments, String)),
  /** 구글 드라이브 항목을 탐색기에서 보여 준다 */
  revealDriveItem: (segments) => ipcRenderer.invoke("crm:drive-reveal", Array.from(segments, String)),
});
