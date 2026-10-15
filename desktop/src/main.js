const { app, BrowserWindow, Menu, shell, clipboard, session, ipcMain } = require("electron");
const path = require("path");
const settings = require("./settings");
const { createTray } = require("./tray");
const { setupDownloads } = require("./downloads");
const { startNotifier } = require("./notifier");
const { setupUpdater } = require("./updater");
const { setupLocalFiles } = require("./local-files");

const APP_ID = "kr.co.complete.crm";
const ICON_PATH = path.join(__dirname, "..", "build", "icon.png");

/** 윈도우 시작 시 자동 실행으로 켜졌으면 창을 띄우지 않고 트레이에만 둔다 */
const startHidden = process.argv.includes("--hidden");

let mainWindow = null;
let isQuitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(init);
}

app.setAppUserModelId(APP_ID);

function crmOrigin() {
  return new URL(settings.crmUrl()).origin;
}

function isCrmUrl(url) {
  try {
    return new URL(url).origin === crmOrigin();
  } catch {
    return false;
  }
}

/** CRM 밖 주소는 기본 브라우저(메일·전화 앱)로 넘긴다. 그 외 스킴은 열지 않는다 */
function openExternalSafe(url) {
  try {
    const { protocol } = new URL(url);
    if (["http:", "https:", "mailto:", "tel:"].includes(protocol)) shell.openExternal(url);
  } catch {
    /* 잘못된 주소는 무시 */
  }
}

function showWindow(targetUrl) {
  if (!mainWindow) return;
  if (targetUrl) mainWindow.loadURL(targetUrl);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** CRM 내부 경로("/tasks/1") 또는 절대 주소를 창에 연다 */
function openInApp(link) {
  const base = settings.crmUrl();
  const url = link ? new URL(link, base + "/").toString() : base;
  showWindow(isCrmUrl(url) ? url : undefined);
  if (!isCrmUrl(url)) openExternalSafe(url);
}

function loadCrm() {
  mainWindow.loadURL(settings.crmUrl());
}

function createWindow() {
  const bounds = settings.get("windowBounds") || { width: 1400, height: 900 };

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 640,
    show: false,
    icon: ICON_PATH,
    title: "COMPLETE CRM",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);

  if (settings.get("windowMaximized")) mainWindow.maximize();

  mainWindow.once("ready-to-show", () => {
    if (!startHidden) mainWindow.show();
  });

  // 창 위치·크기 기억
  const saveBounds = () => {
    if (mainWindow.isMaximized() || mainWindow.isMinimized()) return;
    settings.set("windowBounds", mainWindow.getBounds());
  };
  mainWindow.on("resized", saveBounds);
  mainWindow.on("moved", saveBounds);
  mainWindow.on("maximize", () => settings.set("windowMaximized", true));
  mainWindow.on("unmaximize", () => settings.set("windowMaximized", false));

  // X 버튼: 트레이로 숨기기
  mainWindow.on("close", (e) => {
    if (isQuitting || !settings.get("closeToTray")) return;
    e.preventDefault();
    mainWindow.hide();
    if (!settings.get("trayHintShown")) {
      settings.set("trayHintShown", true);
      tray.showHint();
    }
  });

  const wc = mainWindow.webContents;

  // CRM 밖으로 나가는 이동은 기본 브라우저로
  wc.on("will-navigate", (e, url) => {
    if (isCrmUrl(url)) return;
    e.preventDefault();
    openExternalSafe(url);
  });

  // 새 창(target=_blank, window.open): CRM 페이지는 앱 안의 새 창, 외부는 브라우저
  wc.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank" || url.startsWith("blob:") || isCrmUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          icon: ICON_PATH,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    openExternalSafe(url);
    return { action: "deny" };
  });

  // 서버에 접속하지 못하면 오프라인 안내 화면
  wc.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ABORTED */) return;
    mainWindow.loadFile(path.join(__dirname, "offline.html"), {
      query: { url: url || settings.crmUrl() },
    });
  });

  wc.on("before-input-event", (e, input) => handleShortcut(e, input));
  wc.on("context-menu", (_e, params) => showContextMenu(params));

  loadCrm();
}

function handleShortcut(e, input) {
  if (input.type !== "keyDown") return;
  const wc = mainWindow.webContents;
  const ctrl = input.control || input.meta;
  const key = input.key.toLowerCase();
  let handled = true;

  if (key === "f5" || (ctrl && key === "r")) wc.reload();
  else if (ctrl && input.shift && key === "i") wc.toggleDevTools();
  else if (key === "f12") wc.toggleDevTools();
  else if (ctrl && (key === "=" || key === "+")) wc.setZoomLevel(wc.getZoomLevel() + 0.5);
  else if (ctrl && key === "-") wc.setZoomLevel(wc.getZoomLevel() - 0.5);
  else if (ctrl && key === "0") wc.setZoomLevel(0);
  else if (input.alt && key === "arrowleft" && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  else if (input.alt && key === "arrowright" && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  else handled = false;

  if (handled) e.preventDefault();
}

function showContextMenu(params) {
  const { editFlags, isEditable, selectionText, linkURL } = params;
  const template = [];

  if (linkURL) {
    template.push(
      { label: "브라우저에서 링크 열기", click: () => openExternalSafe(linkURL) },
      { label: "링크 주소 복사", click: () => clipboard.writeText(linkURL) },
      { type: "separator" }
    );
  }
  if (isEditable) {
    template.push(
      { label: "실행 취소", role: "undo", enabled: editFlags.canUndo },
      { label: "다시 실행", role: "redo", enabled: editFlags.canRedo },
      { type: "separator" },
      { label: "잘라내기", role: "cut", enabled: editFlags.canCut },
      { label: "복사", role: "copy", enabled: editFlags.canCopy },
      { label: "붙여넣기", role: "paste", enabled: editFlags.canPaste },
      { label: "모두 선택", role: "selectAll" }
    );
  } else if (selectionText.trim()) {
    template.push({ label: "복사", role: "copy" });
  }
  if (template.length === 0) {
    template.push(
      { label: "뒤로", enabled: mainWindow.webContents.navigationHistory.canGoBack(), click: () => mainWindow.webContents.navigationHistory.goBack() },
      { label: "새로고침", click: () => mainWindow.webContents.reload() }
    );
  }
  Menu.buildFromTemplate(template).popup({ window: mainWindow });
}

let tray = null;

function init() {
  // 오프라인 안내 화면(로컬 파일)의 "다시 연결" 버튼
  ipcMain.on("crm:retry", (e) => {
    if (e.senderFrame?.url.startsWith("file:")) loadCrm();
  });

  createWindow();

  tray = createTray({
    iconPath: ICON_PATH,
    showWindow: () => showWindow(),
    openInApp,
    quit: () => {
      isQuitting = true;
      app.quit();
    },
  });

  setupDownloads({ session: session.defaultSession, getWindow: () => mainWindow, iconPath: ICON_PATH });
  startNotifier({
    session: session.defaultSession,
    iconPath: ICON_PATH,
    getWindow: () => mainWindow,
    openInApp,
    onCount: (count) => tray.setUnreadCount(count),
  });
  setupUpdater({ getWindow: () => mainWindow, beforeQuit: () => (isQuitting = true) });
  setupLocalFiles({
    isAllowedSender: (frame) => Boolean(frame && isCrmUrl(frame.url)),
    getWindow: () => mainWindow,
  });
}

app.on("before-quit", () => {
  isQuitting = true;
});

// 트레이에 남아 있어야 하므로 모든 창이 닫혀도 종료하지 않는다
app.on("window-all-closed", () => {});
