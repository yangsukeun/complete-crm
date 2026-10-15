const { app, Tray, Menu, nativeImage, shell } = require("electron");
const settings = require("./settings");
const { checkForUpdatesManually } = require("./updater");

function createTray({ iconPath, showWindow, openInApp, quit }) {
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  const tray = new Tray(icon);
  let unread = 0;

  const toggle = (key) => () => {
    settings.set(key, !settings.get(key));
    rebuild();
  };

  function rebuild() {
    const openAtLogin = app.getLoginItemSettings().openAtLogin;
    tray.setToolTip(unread > 0 ? `COMPLETE CRM - 읽지 않은 알림 ${unread}개` : "COMPLETE CRM");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "COMPLETE CRM 열기", click: showWindow },
        { label: unread > 0 ? `알림 보기 (${unread})` : "알림 보기", click: () => openInApp("/notifications") },
        { type: "separator" },
        {
          label: "다운로드",
          submenu: [
            {
              label: "받을 때마다 저장 위치 묻기",
              type: "checkbox",
              checked: settings.get("askDownloadLocation"),
              click: toggle("askDownloadLocation"),
            },
            { label: "다운로드 폴더 열기", click: () => shell.openPath(settings.get("downloadDir")) },
          ],
        },
        {
          label: "설정",
          submenu: [
            {
              label: "윈도우 시작 시 자동 실행",
              type: "checkbox",
              checked: openAtLogin,
              click: () => {
                app.setLoginItemSettings({ openAtLogin: !openAtLogin, args: ["--hidden"] });
                rebuild();
              },
            },
            {
              label: "새 알림을 윈도우 알림으로 표시",
              type: "checkbox",
              checked: settings.get("desktopNotifications"),
              click: toggle("desktopNotifications"),
            },
            {
              label: "X 버튼을 누르면 트레이로 숨기기",
              type: "checkbox",
              checked: settings.get("closeToTray"),
              click: toggle("closeToTray"),
            },
          ],
        },
        { type: "separator" },
        { label: "업데이트 확인", click: checkForUpdatesManually },
        { label: `버전 ${app.getVersion()}`, enabled: false },
        { type: "separator" },
        { label: "종료", click: quit },
      ])
    );
  }

  tray.on("click", showWindow);
  rebuild();

  return {
    setUnreadCount(count) {
      if (count === unread) return;
      unread = count;
      rebuild();
    },
    showHint() {
      tray.displayBalloon({
        iconType: "info",
        title: "COMPLETE CRM이 계속 실행 중입니다",
        content: "알림을 받기 위해 트레이에서 실행됩니다. 완전히 끄려면 트레이 아이콘 → 종료를 누르세요.",
      });
    },
  };
}

module.exports = { createTray };
