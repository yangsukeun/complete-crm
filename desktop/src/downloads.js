const { Notification, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const settings = require("./settings");

/** 같은 이름 파일이 있으면 "이름 (1).xlsx" 처럼 번호를 붙인다 */
function uniquePath(dir, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(dir, filename);
  for (let i = 1; fs.existsSync(candidate); i++) {
    candidate = path.join(dir, `${base} (${i})${ext}`);
  }
  return candidate;
}

function setupDownloads({ session, getWindow, iconPath }) {
  let active = 0;

  session.on("will-download", (_e, item) => {
    const filename = item.getFilename();
    const dir = settings.get("downloadDir");

    if (settings.get("askDownloadLocation")) {
      item.setSaveDialogOptions({ title: "다른 이름으로 저장", defaultPath: path.join(dir, filename) });
    } else {
      fs.mkdirSync(dir, { recursive: true });
      item.setSavePath(uniquePath(dir, filename));
    }

    active++;
    item.on("updated", () => {
      const win = getWindow();
      const total = item.getTotalBytes();
      if (win && total > 0) win.setProgressBar(item.getReceivedBytes() / total);
    });

    item.once("done", (_ev, state) => {
      active--;
      const win = getWindow();
      if (win && active === 0) win.setProgressBar(-1);
      if (state !== "completed") return;

      const savedPath = item.getSavePath();
      // 다음 번 저장 위치는 마지막으로 고른 폴더
      settings.set("downloadDir", path.dirname(savedPath));

      if (!Notification.isSupported()) return;
      const n = new Notification({
        title: "다운로드 완료",
        body: `${path.basename(savedPath)}\n클릭하면 파일을 엽니다.`,
        icon: iconPath,
      });
      n.on("click", () => shell.openPath(savedPath));
      n.show();
    });
  });
}

module.exports = { setupDownloads };
