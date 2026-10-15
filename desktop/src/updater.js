const { app, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let manualCheck = false;

/**
 * GitHub Releases(yangsukeun/complete-crm)에 올린 새 버전을 확인해
 * 백그라운드로 받은 뒤 재시작할지 묻는다. 설치본(패키징된 앱)에서만 동작한다.
 */
function setupUpdater({ getWindow, beforeQuit }) {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-not-available", () => {
    if (!manualCheck) return;
    manualCheck = false;
    dialog.showMessageBox({ type: "info", title: "업데이트", message: `최신 버전(${app.getVersion()})을 사용 중입니다.` });
  });

  autoUpdater.on("update-available", (info) => {
    if (!manualCheck) return;
    manualCheck = false;
    dialog.showMessageBox({
      type: "info",
      title: "업데이트",
      message: `새 버전 ${info.version}을 내려받는 중입니다. 준비되면 알려 드립니다.`,
    });
  });

  autoUpdater.on("error", (err) => {
    console.error("업데이트 오류:", err);
    if (!manualCheck) return;
    manualCheck = false;
    dialog.showMessageBox({ type: "error", title: "업데이트", message: "업데이트를 확인하지 못했습니다.", detail: String(err?.message || err) });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    const { response } = await dialog.showMessageBox(getWindow() ?? undefined, {
      type: "info",
      title: "업데이트 준비 완료",
      message: `새 버전 ${info.version}이 준비되었습니다.`,
      detail: "지금 다시 시작해 업데이트할까요? 나중에 하면 프로그램을 종료할 때 설치됩니다.",
      buttons: ["지금 다시 시작", "나중에"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      beforeQuit();
      autoUpdater.quitAndInstall();
    }
  });

  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 10 * 1000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), CHECK_INTERVAL_MS);
}

function checkForUpdatesManually() {
  if (!app.isPackaged) {
    dialog.showMessageBox({ type: "info", title: "업데이트", message: "개발 모드에서는 업데이트를 확인하지 않습니다." });
    return;
  }
  manualCheck = true;
  autoUpdater.checkForUpdates().catch(() => {});
}

module.exports = { setupUpdater, checkForUpdatesManually };
