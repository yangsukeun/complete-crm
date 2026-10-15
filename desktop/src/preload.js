const { contextBridge, ipcRenderer } = require("electron");

/**
 * 웹 CRM이 데스크톱 앱 안에서 실행 중인지 알 수 있도록 노출한다.
 * 웹 쪽에서는 `window.crmDesktop?.isDesktop` 으로 확인한다(2단계 연동에서 사용).
 */
contextBridge.exposeInMainWorld("crmDesktop", {
  isDesktop: true,
  platform: process.platform,
  retry: () => ipcRenderer.send("crm:retry"),
});
