const { app } = require("electron");
const fs = require("fs");
const path = require("path");

/** 기본 접속 주소. 환경변수 CRM_URL 또는 settings.json 의 crmUrl 로 바꿀 수 있다. */
const DEFAULT_CRM_URL = "https://complete-crm-liard.vercel.app";

const DEFAULTS = {
  crmUrl: DEFAULT_CRM_URL,
  /** true: 다운로드할 때마다 저장 위치를 묻는다. false: downloadDir 에 바로 저장 */
  askDownloadLocation: true,
  downloadDir: "",
  /** 창 닫기(X) 시 트레이로 숨김 */
  closeToTray: true,
  /** 트레이 숨김 안내를 이미 보여줬는지 */
  trayHintShown: false,
  desktopNotifications: true,
  windowBounds: null,
  windowMaximized: false,
  /** 마지막으로 알림을 띄운 시각(ISO). 이전 알림을 다시 띄우지 않기 위함 */
  lastNotifiedAt: null,
};

let cache = null;

function filePath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function load() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(filePath(), "utf8")) };
  } catch {
    cache = { ...DEFAULTS };
  }
  if (!cache.downloadDir) cache.downloadDir = app.getPath("downloads");
  return cache;
}

function get(key) {
  return load()[key];
}

function set(key, value) {
  load()[key] = value;
  try {
    fs.mkdirSync(path.dirname(filePath()), { recursive: true });
    fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), "utf8");
  } catch (e) {
    console.error("설정 저장 실패:", e);
  }
}

/** 환경변수가 설정 파일보다 우선한다(개발용). 끝의 / 는 제거 */
function crmUrl() {
  return (process.env.CRM_URL || get("crmUrl") || DEFAULT_CRM_URL).replace(/\/+$/, "");
}

module.exports = { get, set, crmUrl };
