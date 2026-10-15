const { Notification } = require("electron");
const settings = require("./settings");

const POLL_MS = 60 * 1000;
/** 한 번에 이보다 많이 쌓이면 "새 알림 N개" 로 묶어서 보여준다 */
const MAX_INDIVIDUAL = 3;

/**
 * 웹 푸시(OneSignal)는 Electron에서 동작하지 않으므로,
 * 로그인 세션 쿠키로 CRM 알림 API를 주기적으로 조회해 윈도우 알림을 띄운다.
 */
function startNotifier({ session, iconPath, getWindow, openInApp, onCount }) {
  async function poll() {
    let list;
    try {
      const res = await session.fetch(`${settings.crmUrl()}/api/notifications?unreadOnly=true&limit=20`, {
        cache: "no-store",
      });
      if (!res.ok) return; // 401: 아직 로그인 전
      list = await res.json();
    } catch {
      return; // 오프라인 등 — 다음 주기에 다시 시도
    }
    if (!Array.isArray(list)) return;

    onCount(list.length);

    const last = settings.get("lastNotifiedAt");
    const newest = list.reduce((max, n) => (n.createdAt > max ? n.createdAt : max), last || "");
    if (newest) settings.set("lastNotifiedAt", newest);

    // 처음 실행 시에는 기존 미읽음 알림을 한꺼번에 띄우지 않는다
    if (!last) return;

    const fresh = list.filter((n) => n.createdAt > last).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (fresh.length === 0 || !settings.get("desktopNotifications") || !Notification.isSupported()) return;

    // 창을 보고 있는 중이면 웹 화면의 알림으로 충분하다
    const win = getWindow();
    if (win && win.isVisible() && win.isFocused()) return;

    if (fresh.length > MAX_INDIVIDUAL) {
      show("COMPLETE CRM", `새 알림 ${fresh.length}개가 있습니다.`, "/notifications");
    } else {
      for (const n of fresh) show("COMPLETE CRM", n.message, n.link || "/notifications");
    }
  }

  function show(title, body, link) {
    const n = new Notification({ title, body, icon: iconPath });
    n.on("click", () => openInApp(link));
    n.show();
  }

  poll();
  setInterval(poll, POLL_MS);
  // 창으로 돌아오면 바로 개수 갱신
  getWindow()?.on("focus", poll);
}

module.exports = { startNotifier };
